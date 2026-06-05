import asyncio
import time
import logging
from datetime import datetime
from typing import List, Dict, Any

import openai
from openai import OpenAI

from app.config import settings
from app.database import supabase_client
from app.services.rag import rag_service
from app.services.embeddings import embedding_service
from app.utils.error_handler import get_logger, log_error, OpenAIError, SupabaseError

logger = get_logger("ai_engine")

# ──────────────────────────────────────────────
# Fallback reply returned on any AI failure
# ──────────────────────────────────────────────
FALLBACK_REPLY = {
    "reply": "I'm having trouble processing your request right now. Our team will get back to you shortly.",
    "confidence": 0.0,
    "should_escalate": True,
    "sources": [],
    "tokens_used": 0,
    "error": True,
}


class AIEngineService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4o-mini"

    # ──────────────────────────────────────────────
    # Conversation History Loader
    # ──────────────────────────────────────────────
    def get_conversation_history(self, conversation_id: str, limit: int = 5) -> List[Dict[str, str]]:
        """Retrieves last N messages formatted for ChatCompletions."""
        try:
            res = supabase_client.table("messages") \
                .select("sender_type, content") \
                .eq("conversation_id", conversation_id) \
                .order("created_at", desc=True) \
                .limit(limit) \
                .execute()
        except Exception as exc:
            raise SupabaseError(f"Conversation history fetch failed for {conversation_id}", str(exc))

        history = []
        for msg in reversed(res.data or []):
            role = "assistant" if msg["sender_type"] in ("ai", "agent") else "user"
            history.append({"role": role, "content": msg["content"]})
        return history

    # ──────────────────────────────────────────────
    # Lead Scoring
    # ──────────────────────────────────────────────
    def update_lead_score(self, contact_id: str, message: str, org_id: str) -> Dict[str, Any]:
        """Keyword-based CRM lead score updater."""
        try:
            contact_res = supabase_client.table("contacts") \
                .select("lead_score") \
                .eq("id", contact_id) \
                .eq("org_id", org_id) \
                .execute()
        except Exception as exc:
            raise SupabaseError(f"Lead score fetch failed for contact {contact_id}", str(exc))

        current_score = 0
        if contact_res.data:
            current_score = contact_res.data[0].get("lead_score") or 0

        msg_lower = message.lower()
        delta = 5  # baseline interaction delta

        if any(kw in msg_lower for kw in ["budget", "price", "cost", "pricing", "charge", "rate", "fee"]):
            delta += 20
        if any(kw in msg_lower for kw in ["urgent", "asap", "today", "now", "quick", "emergency", "immediately"]):
            delta += 15
        if any(kw in msg_lower for kw in ["buy", "purchase", "order", "subscribe", "checkout", "pay", "acquire"]):
            delta += 10

        new_score = max(0, min(100, current_score + delta))
        lead_status = "cold"
        if new_score > 70:
            lead_status = "hot"
        elif new_score > 40:
            lead_status = "warm"

        try:
            supabase_client.table("contacts").update({
                "lead_score": new_score,
                "lead_status": lead_status,
            }).eq("id", contact_id).eq("org_id", org_id).execute()
        except Exception as exc:
            raise SupabaseError(f"Lead score update failed for contact {contact_id}", str(exc))

        logger.info("[LeadScore] contact=%s | %d→%d (%s)", contact_id, current_score, new_score, lead_status)
        return {"lead_score": new_score, "lead_status": lead_status}

    # ──────────────────────────────────────────────
    # OpenAI ChatCompletion — with retry logic
    # ──────────────────────────────────────────────
    def _call_openai(self, messages_payload: list, attempt: int = 0) -> Any:
        """
        Calls OpenAI ChatCompletion API.
        - RateLimitError  → wait 10s, retry once
        - APITimeoutError → return None immediately
        - Any other error → return None
        """
        try:
            return self.client.chat.completions.create(
                model=self.model,
                messages=messages_payload,
                temperature=0.3,
                max_tokens=500,
            )
        except openai.RateLimitError as exc:
            if attempt == 0:
                logger.warning("[OpenAI] Rate limit hit — waiting 10s before retry...")
                time.sleep(10)
                return self._call_openai(messages_payload, attempt=1)
            log_error("OpenAIError", "OpenAI rate limit exceeded after retry.", exc)
            return None
        except openai.APITimeoutError as exc:
            log_error("OpenAIError", "OpenAI API timeout — returning fallback immediately.", exc)
            return None
        except openai.APIConnectionError as exc:
            log_error("OpenAIError", "OpenAI connection error.", exc)
            return None
        except Exception as exc:
            log_error("OpenAIError", f"Unexpected OpenAI error: {str(exc)}", exc)
            return None

    # ──────────────────────────────────────────────
    # Main Reply Generator
    # ──────────────────────────────────────────────
    def generate_reply(
        self,
        message: str,
        conversation_id: str,
        org_id: str,
        contact: dict,
    ) -> dict:
        """
        Full RAG + GPT pipeline.
        Returns FALLBACK_REPLY on any failure — never crashes the caller.
        """
        t0 = time.monotonic()
        try:
            # 1. Org name
            try:
                org_res = supabase_client.table("organizations") \
                    .select("name") \
                    .eq("id", org_id) \
                    .execute()
            except Exception as exc:
                raise SupabaseError("Org name fetch failed", str(exc))

            org_name = "ConverseOS Partner"
            if org_res.data:
                org_name = org_res.data[0].get("name", org_name)

            # 2. RAG knowledge base search
            chunks = rag_service.search_knowledge_base(message, org_id, top_k=5)

            context_blocks = []
            tokens_sum = 0
            chunk_ids = []

            for chunk in chunks:
                chunk_content = chunk.get("content", "")
                chunk_tokens = embedding_service.count_tokens(chunk_content)
                if tokens_sum + chunk_tokens <= 3000:
                    context_blocks.append(chunk_content)
                    tokens_sum += chunk_tokens
                    if chunk.get("id"):
                        chunk_ids.append(str(chunk["id"]))
                else:
                    break

            context_text = "\n\n---\n\n".join(context_blocks) if context_blocks else "No relevant context found."

            # Confidence from top similarity
            top_similarity = chunks[0].get("similarity", 0.0) if chunks else 0.0
            if top_similarity > 0.85:
                confidence = 0.95
            elif top_similarity >= 0.70:
                confidence = 0.80
            elif top_similarity >= 0.50:
                confidence = 0.60
            elif top_similarity > 0.0:
                confidence = 0.30
            else:
                confidence = 0.20

            should_escalate = confidence < 0.70

            # 3. Message count for context
            try:
                msg_count_res = supabase_client.table("messages") \
                    .select("id", count="exact") \
                    .eq("conversation_id", conversation_id) \
                    .execute()
            except Exception as exc:
                raise SupabaseError("Message count fetch failed", str(exc))

            conversation_count = msg_count_res.count or 0

            # 4. System prompt
            system_prompt = (
                f"You are an AI customer support assistant for {org_name}.\n"
                "Answer questions based ONLY on the provided knowledge base context.\n"
                "Be helpful, concise, and friendly.\n"
                "If the answer is not in the context, say: 'Let me connect you with our team for this query.'\n"
                "Always respond in the same language the customer used.\n\n"
                f"Knowledge Base Context:\n{context_text}\n\n"
                "Customer Information:\n"
                f"- Name: {contact.get('name', 'Customer')}\n"
                f"- Previous interactions: {conversation_count}\n\n"
                f"Current date: {datetime.utcnow().strftime('%Y-%m-%d UTC')}"
            )

            # 5. History
            history = self.get_conversation_history(conversation_id, limit=5)

            messages_payload = [{"role": "system", "content": system_prompt}]
            messages_payload.extend(history)
            messages_payload.append({"role": "user", "content": message})

            # 6. Call OpenAI (with retry)
            response = self._call_openai(messages_payload)

            if response is None:
                logger.warning("[AI] OpenAI returned None — using fallback reply.")
                return FALLBACK_REPLY.copy()

            reply_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0
            latency_ms = int((time.monotonic() - t0) * 1000)

            logger.info(
                "[AI] Reply OK | org=%s | confidence=%.2f | tokens=%d | latency=%dms",
                org_id, confidence, tokens_used, latency_ms,
            )

            # 7. Update lead score (non-blocking, swallow errors)
            try:
                self.update_lead_score(contact["id"], message, org_id)
            except SupabaseError as exc:
                log_error("SupabaseError", f"Lead score update failed (non-critical): {exc.message}")

            return {
                "reply": reply_text,
                "confidence": confidence,
                "should_escalate": should_escalate,
                "sources": chunk_ids,
                "tokens_used": tokens_used,
                "error": False,
            }

        except SupabaseError as exc:
            log_error("SupabaseError", exc.message, exc)
            return FALLBACK_REPLY.copy()
        except Exception as exc:
            log_error("UnhandledException", f"AI generate_reply crashed: {str(exc)}", exc)
            return FALLBACK_REPLY.copy()


# Singleton
ai_engine_service = AIEngineService()

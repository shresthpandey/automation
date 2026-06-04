import logging
from datetime import datetime
from typing import List, Dict, Any
from app.config import settings
from app.database import supabase_client
from app.services.rag import rag_service
from app.services.embeddings import embedding_service
from openai import OpenAI

# Setup logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_engine")

class AIEngineService:
    def __init__(self):
        # OpenAI client initialization
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = "gpt-4o-mini"

    def get_conversation_history(self, conversation_id: str, limit: int = 5) -> List[Dict[str, str]]:
        """
        Retrieves the last N messages of a conversation thread formatted for ChatCompletions.
        """
        try:
            res = supabase_client.table("messages") \
                .select("sender_type, content") \
                .eq("conversation_id", conversation_id) \
                .order("created_at", desc=True) \
                .limit(limit) \
                .execute()
                
            history = []
            # Order items chronologically (from oldest to newest)
            for msg in reversed(res.data or []):
                role = "assistant"
                if msg["sender_type"] == "contact":
                    role = "user"
                elif msg["sender_type"] == "ai":
                    role = "assistant"
                elif msg["sender_type"] == "agent":
                    role = "assistant"
                    
                history.append({"role": role, "content": msg["content"]})
            return history
        except Exception as e:
            logger.error(f"Failed to load conversation history for {conversation_id}: {str(e)}")
            return []

    def update_lead_score(self, contact_id: str, message: str, org_id: str) -> Dict[str, Any]:
        """
        Processes keyword-based rules to adjust and update CRM contact lead status parameters.
        """
        try:
            # 1. Fetch current lead score
            contact_res = supabase_client.table("contacts") \
                .select("lead_score") \
                .eq("id", contact_id) \
                .eq("org_id", org_id) \
                .execute()
                
            current_score = 0
            if contact_res.data:
                current_score = contact_res.data[0].get("lead_score") or 0

            # 2. Match rules
            msg_lower = message.lower()
            delta = 0
            
            # Category 1: Budget (+20)
            budget_kws = ["budget", "price", "cost", "pricing", "charge", "rate", "fee"]
            if any(kw in msg_lower for kw in budget_kws):
                delta += 20
                
            # Category 2: Urgent (+15)
            urgent_kws = ["urgent", "asap", "today", "now", "quick", "emergency", "immediately"]
            if any(kw in msg_lower for kw in urgent_kws):
                delta += 15
                
            # Category 3: Buy (+10)
            buy_kws = ["buy", "purchase", "order", "subscribe", "checkout", "pay", "acquire"]
            if any(kw in msg_lower for kw in buy_kws):
                delta += 10
                
            # Category 4: General message follow up (+5)
            delta += 5

            # 3. Apply floor/ceil constraints (0-100)
            new_score = max(0, min(100, current_score + delta))
            
            # Map statuses
            lead_status = "cold"
            if new_score > 70:
                lead_status = "hot"
            elif new_score > 40:
                lead_status = "warm"
                
            # 4. Save updates to contacts table
            supabase_client.table("contacts").update({
                "lead_score": new_score,
                "lead_status": lead_status
            }).eq("id", contact_id).eq("org_id", org_id).execute()
            
            logger.info(f"Updated lead score for contact {contact_id}: {current_score} -> {new_score} ({lead_status})")
            return {"lead_score": new_score, "lead_status": lead_status}
            
        except Exception as e:
            logger.error(f"Failed to update lead score for contact {contact_id}: {str(e)}")
            return {}

    def generate_reply(
        self, 
        message: str, 
        conversation_id: str, 
        org_id: str, 
        contact: dict
    ) -> dict:
        """
        Executes search matches in the knowledge base, builds system instruction parameters,
        and requests OpenAI ChatCompletions reply generation.
        """
        try:
            # 1. Look up the organization name
            org_res = supabase_client.table("organizations") \
                .select("name") \
                .eq("id", org_id) \
                .execute()
            
            org_name = "ConverseOS Partner"
            if org_res.data:
                org_name = org_res.data[0].get("name", org_name)

            # 2. Search knowledge base vector matching nodes (RAG)
            chunks = rag_service.search_knowledge_base(message, org_id, top_k=5)
            
            # Build context concatenation (max 3000 tokens limit)
            context_blocks = []
            tokens_sum = 0
            chunk_ids = []
            
            for chunk in chunks:
                chunk_content = chunk.get("content", "")
                chunk_tokens = embedding_service.count_tokens(chunk_content)
                
                if tokens_sum + chunk_tokens <= 3000:
                    context_blocks.append(chunk_content)
                    tokens_sum += chunk_tokens
                    # Log the source chunk UUID if available
                    if chunk.get("id"):
                        chunk_ids.append(str(chunk["id"]))
                else:
                    break
                    
            context_text = "\n\n---\n\n".join(context_blocks) if context_blocks else "No relevant context found."

            # Calculate confidence level based on similarity score parameters
            top_similarity = 0.0
            if chunks:
                top_similarity = chunks[0].get("similarity", 0.0)
                
            confidence = 0.20
            if top_similarity > 0.85:
                confidence = 0.95
            elif top_similarity >= 0.70:
                confidence = 0.80
            elif top_similarity >= 0.50:
                confidence = 0.60
            elif top_similarity > 0.0:
                confidence = 0.30
                
            should_escalate = confidence < 0.70

            # 3. Pull total message interactions count for statistics tracking
            msg_count_res = supabase_client.table("messages") \
                .select("id", count="exact") \
                .eq("conversation_id", conversation_id) \
                .execute()
                
            conversation_count = msg_count_res.count or 0

            # 4. Construct System Prompt Template
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

            # 5. Load historical chat logs (limit 5)
            history = self.get_conversation_history(conversation_id, limit=5)
            
            messages_payload = [
                {"role": "system", "content": system_prompt}
            ]
            # Append historical messages
            messages_payload.extend(history)
            # Append current client message
            messages_payload.append({"role": "user", "content": message})

            # 6. Request OpenAI ChatCompletion
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages_payload,
                temperature=0.3,
                max_tokens=500
            )
            
            reply_text = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else 0

            # 7. Update CRM Lead scoring status in the background
            self.update_lead_score(contact["id"], message, org_id)

            return {
                "reply": reply_text,
                "confidence": confidence,
                "should_escalate": should_escalate,
                "sources": chunk_ids,
                "tokens_used": tokens_used
            }
            
        except Exception as e:
            logger.error(f"Fatal exception during AI reply generation flow: {str(e)}", exc_info=True)
            return {
                "reply": "Let me connect you with our team for this query.",
                "confidence": 0.20,
                "should_escalate": True,
                "sources": [],
                "tokens_used": 0
            }

# Instantiated Service Singleton
ai_engine_service = AIEngineService()

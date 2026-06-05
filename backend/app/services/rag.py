import asyncio
import io
import logging
import re
import time
from typing import List, Dict, Any

from app.database import supabase_client
from app.services.embeddings import embedding_service
from app.utils.error_handler import get_logger, log_error, SupabaseError, OpenAIError

from PyPDF2 import PdfReader
from docx import Document as DocxDocument

logger = get_logger("rag_service")


class RAGService:

    def split_into_sentences(self, text: str) -> List[str]:
        sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s', text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk_text(self, text: str, file_name: str) -> List[Dict[str, Any]]:
        """
        Paragraph → sentence chunking with 50-token overlap.
        """
        paragraphs = text.split("\n\n")
        raw_chunks = []

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            para_tokens = embedding_service.count_tokens(para)
            if para_tokens <= 500:
                raw_chunks.append(para)
            else:
                sentences = self.split_into_sentences(para)
                current_chunk: List[str] = []
                current_tokens = 0
                for sentence in sentences:
                    stokens = embedding_service.count_tokens(sentence)
                    if current_tokens + stokens <= 500:
                        current_chunk.append(sentence)
                        current_tokens += stokens
                    else:
                        if current_chunk:
                            raw_chunks.append(" ".join(current_chunk))
                        current_chunk = [sentence]
                        current_tokens = stokens
                if current_chunk:
                    raw_chunks.append(" ".join(current_chunk))

        final_chunks = []
        for idx, block in enumerate(raw_chunks):
            overlap_prefix = ""
            if idx > 0:
                prev_words = raw_chunks[idx - 1].split()
                overlap_prefix = " ".join(prev_words[-15:]) + " "
            chunk_content = f"{overlap_prefix}{block}".strip()
            final_chunks.append({
                "content": chunk_content,
                "metadata": {
                    "source_file": file_name,
                    "chunk_index": idx,
                    "total_chunks": 0,  # filled below
                },
            })

        total = len(final_chunks)
        for chunk in final_chunks:
            chunk["metadata"]["total_chunks"] = total

        return final_chunks

    # ──────────────────────────────────────────────
    # Document Ingestion Pipeline
    # ──────────────────────────────────────────────
    async def process_document(self, doc_id: str, file_path: str, org_id: str) -> None:
        """
        Downloads file → parses text → generates embeddings → saves chunks.
        Each phase wrapped separately; partial inserts are rolled back on failure.
        """
        logger.info("[RAG] Starting ingestion | doc=%s org=%s", doc_id, org_id)
        inserted_chunk_ids: List[str] = []

        def _mark_failed(reason: str) -> None:
            try:
                supabase_client.table("knowledge_base_documents").update({
                    "status": "failed",
                    "error_message": reason[:500],
                }).eq("id", doc_id).execute()
            except Exception as exc:
                log_error("SupabaseError", f"Could not mark doc {doc_id} as failed: {str(exc)}")

        # ── Phase 1: Download ───────────────────────
        try:
            raw_bytes = supabase_client.storage.from_("knowledge-docs").download(file_path)
            file_bytes = io.BytesIO(raw_bytes)
            logger.info("[RAG] Downloaded file: %s (%d bytes)", file_path, len(raw_bytes))
        except Exception as exc:
            log_error("SupabaseError", f"File download failed for {file_path}", exc)
            _mark_failed(f"Download error: {str(exc)}")
            return

        # ── Phase 2: Parse text ─────────────────────
        extracted_text = ""
        try:
            lower = file_path.lower()
            if lower.endswith(".pdf"):
                reader = PdfReader(file_bytes)
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        extracted_text += t + "\n"
            elif lower.endswith(".docx"):
                doc_obj = DocxDocument(file_bytes)
                for para in doc_obj.paragraphs:
                    extracted_text += para.text + "\n"
            else:
                extracted_text = raw_bytes.decode("utf-8", errors="ignore")

            if not extracted_text.strip():
                raise ValueError("Document has no readable text content.")

            logger.info("[RAG] Extracted %d chars from %s", len(extracted_text), file_path)
        except Exception as exc:
            log_error("RAGParseError", f"Text extraction failed for {file_path}", exc)
            _mark_failed(f"Parse error: {str(exc)}")
            return

        # ── Phase 3: Chunk ──────────────────────────
        file_name = file_path.split("/")[-1]
        chunks = self.chunk_text(extracted_text, file_name)
        logger.info("[RAG] Chunked into %d segments | doc=%s", len(chunks), doc_id)

        # ── Phase 4: Embed + Insert (with retry) ────
        for idx, chunk in enumerate(chunks):
            # Embedding with retry
            vector = None
            for attempt in range(2):
                try:
                    vector = embedding_service.get_embedding(chunk["content"])
                    break
                except Exception as exc:
                    if attempt == 0:
                        logger.warning("[RAG] Embedding attempt 1 failed — retrying in 2s...")
                        await asyncio.sleep(2)
                    else:
                        log_error("OpenAIError", f"Embedding failed for chunk {idx} of doc {doc_id}", exc)

            if not vector:
                # Rollback partial inserts
                if inserted_chunk_ids:
                    try:
                        for cid in inserted_chunk_ids:
                            supabase_client.table("knowledge_base_chunks") \
                                .delete().eq("id", cid).execute()
                        logger.info("[RAG] Rolled back %d partial chunks for doc %s", len(inserted_chunk_ids), doc_id)
                    except Exception as rollback_exc:
                        log_error("SupabaseError", f"Rollback failed for doc {doc_id}", rollback_exc)
                _mark_failed(f"Embedding generation failed at chunk {idx}")
                return

            try:
                ins_res = supabase_client.table("knowledge_base_chunks").insert({
                    "doc_id": doc_id,
                    "org_id": org_id,
                    "content": chunk["content"],
                    "embedding": vector,
                    "metadata": chunk["metadata"],
                }).execute()
                if ins_res.data:
                    inserted_chunk_ids.append(ins_res.data[0]["id"])
            except Exception as exc:
                log_error("SupabaseError", f"Chunk insert failed at chunk {idx} for doc {doc_id}", exc)
                # Rollback
                for cid in inserted_chunk_ids:
                    try:
                        supabase_client.table("knowledge_base_chunks").delete().eq("id", cid).execute()
                    except Exception:
                        pass
                _mark_failed(f"DB insert error at chunk {idx}: {str(exc)}")
                return

        # ── Phase 5: Mark ready ─────────────────────
        try:
            supabase_client.table("knowledge_base_documents").update({
                "status": "ready",
                "chunk_count": len(chunks),
            }).eq("id", doc_id).execute()
            logger.info("[RAG] Ingestion complete | doc=%s | chunks=%d", doc_id, len(chunks))
        except Exception as exc:
            log_error("SupabaseError", f"Could not mark doc {doc_id} as ready", exc)

    # ──────────────────────────────────────────────
    # Knowledge Base Search
    # ──────────────────────────────────────────────
    def search_knowledge_base(self, query: str, org_id: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Vector similarity search via pgvector RPC."""
        try:
            logger.info("[RAG] Vector search | org=%s | query_len=%d", org_id, len(query))
            query_vector = embedding_service.get_embedding(query)
            response = supabase_client.rpc(
                "match_chunks",
                {"query_embedding": query_vector, "org_id": org_id, "match_count": top_k},
            ).execute()
            return response.data or []
        except Exception as exc:
            log_error("SupabaseError", f"RAG search failed for org {org_id}", exc)
            return []


# Singleton
rag_service = RAGService()

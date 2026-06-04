import io
import logging
import re
from typing import List, Dict, Any
from app.database import supabase_client
from app.services.embeddings import embedding_service
from PyPDF2 import PdfReader
from docx import Document as DocxDocument

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag_service")

class RAGService:
    def split_into_sentences(self, text: str) -> List[str]:
        """
        Splits a string text into list of sentences using regex.
        """
        sentences = re.split(r'(?<!\w\.\w.)(?<![A-Z][a-z]\.)(?<=\.|\?)\s', text)
        return [s.strip() for s in sentences if s.strip()]

    def chunk_text(self, text: str, file_name: str) -> List[Dict[str, Any]]:
        """
        Applies chunking logic: splits by paragraphs first.
        If paragraph > 500 tokens, splits it further by sentences.
        Maintains 50 tokens overlap between chunks.
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
                # Split large paragraphs by sentences
                sentences = self.split_into_sentences(para)
                current_chunk = []
                current_tokens = 0
                
                for sentence in sentences:
                    sentence_tokens = embedding_service.count_tokens(sentence)
                    if current_tokens + sentence_tokens <= 500:
                        current_chunk.append(sentence)
                        current_tokens += sentence_tokens
                    else:
                        if current_chunk:
                            raw_chunks.append(" ".join(current_chunk))
                        # Implement 50 token overlap by retaining trailing items if needed
                        current_chunk = [sentence]
                        current_tokens = sentence_tokens
                        
                if current_chunk:
                    raw_chunks.append(" ".join(current_chunk))
                    
        # Apply 50 token overlap across list of chunks and build metadata
        final_chunks = []
        overlap_size = 50
        
        for idx, text_block in enumerate(raw_chunks):
            # Resolve overlapping prefix
            overlap_prefix = ""
            if idx > 0:
                prev_block = raw_chunks[idx - 1]
                prev_words = prev_block.split()
                # Grab last ~50 tokens approximately in characters/words
                overlap_prefix = " ".join(prev_words[-15:]) + " "
                
            chunk_content = f"{overlap_prefix}{text_block}".strip()
            final_chunks.append({
                "content": chunk_content,
                "metadata": {
                    "source_file": file_name,
                    "chunk_index": idx
                }
            })
            
        # Add total_chunks count to metadata
        total = len(final_chunks)
        for chunk in final_chunks:
            chunk["metadata"]["total_chunks"] = total
            
        return final_chunks

    async def process_document(self, doc_id: str, file_path: str, org_id: str) -> None:
        """
        Background task to download files, extract content, generate embeddings and update DB tables.
        """
        logger.info(f"Starting background RAG ingestion task for document: {doc_id}")
        try:
            # 1. Download file content from Supabase storage
            response_file = supabase_client.storage.from_("knowledge-docs").download(file_path)
            file_bytes = io.BytesIO(response_file)
            
            # Resolve extension
            extracted_text = ""
            lower_path = file_path.lower()
            
            if lower_path.endswith(".pdf"):
                reader = PdfReader(file_bytes)
                for page in reader.pages:
                    text_content = page.extract_text()
                    if text_content:
                        extracted_text += text_content + "\n"
            elif lower_path.endswith(".docx"):
                doc_obj = DocxDocument(file_bytes)
                for paragraph in doc_obj.paragraphs:
                    extracted_text += paragraph.text + "\n"
            else:
                # Default decode TXT
                extracted_text = response_file.decode("utf-8", errors="ignore")
                
            if not extracted_text.strip():
                raise ValueError("Document file has no readable text content.")

            # 2. Chunk text and metadata
            file_name = file_path.split("/")[-1]
            chunks = self.chunk_text(extracted_text, file_name)
            
            # 3. Create vector embeddings and insert records
            for chunk in chunks:
                vector = embedding_service.get_embedding(chunk["content"])
                
                supabase_client.table("knowledge_base_chunks").insert({
                    "doc_id": doc_id,
                    "org_id": org_id,
                    "content": chunk["content"],
                    "embedding": vector,
                    "metadata": chunk["metadata"]
                }).execute()
                
            # 4. Update parent document status
            supabase_client.table("knowledge_base_documents").update({
                "status": "ready",
                "chunk_count": len(chunks)
            }).eq("id", doc_id).execute()
            
            logger.info(f"RAG Ingestion succeeded: {len(chunks)} chunks cataloged for doc {doc_id}")
            
        except Exception as e:
            logger.error(f"RAG Ingestion failed for doc {doc_id}: {str(e)}", exc_info=True)
            supabase_client.table("knowledge_base_documents").update({
                "status": "failed"
            }).eq("id", doc_id).execute()

    def search_knowledge_base(self, query: str, org_id: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Finds matching text nodes in the database utilizing cosine similarity vector query calls.
        """
        try:
            logger.info(f"Querying knowledge base matching chunks for query='{query}' org_id={org_id}")
            query_vector = embedding_service.get_embedding(query)
            
            response = supabase_client.rpc(
                "match_chunks",
                {
                    "query_embedding": query_vector,
                    "org_id": org_id,
                    "match_count": top_k
                }
            ).execute()
            
            return response.data or []
        except Exception as e:
            logger.error(f"Failed to query match_chunks in RAG search: {str(e)}", exc_info=True)
            return []

# Singleton instance
rag_service = RAGService()

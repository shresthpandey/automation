import logging
import uuid
from fastapi import APIRouter, UploadFile, File, Header, BackgroundTasks, HTTPException
from typing import List
from app.database import supabase_client
from app.services.rag import rag_service

# Setup logger configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("knowledge_base_router")

router = APIRouter()

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit

def get_org_id_from_header(x_organization_id: str = Header(None)) -> str:
    """
    Extracts org_id from X-Organization-Id request header.
    In case of missing values, queries the first organization record in the DB
    to serve as a fallback for testing configurations.
    """
    if x_organization_id:
        return x_organization_id
        
    # Fallback to default organization for local development/testing
    orgs = supabase_client.table("organizations").select("id").limit(1).execute()
    if orgs.data:
        return orgs.data[0]["id"]
        
    # If no organizations exist, raise HTTP error
    raise HTTPException(status_code=400, detail="X-Organization-Id header missing and no organizations registered in DB.")

@router.post("/upload")
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    org_id: str = Header(None)
):
    """
    Saves document to Supabase Storage bucket 'knowledge-docs' under org path,
    creates a catalog entry and triggers background segmentation processing.
    """
    resolved_org_id = get_org_id_from_header(org_id)
    
    # 1. Verify file size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds the maximum 10MB limit.")
        
    # Reset seek pointer
    await file.seek(0)
    
    # 2. Verify file extension type compatibility
    file_name = file.filename
    lower_name = file_name.lower()
    if not (lower_name.endswith(".pdf") or lower_name.endswith(".txt") or lower_name.endswith(".docx")):
        raise HTTPException(status_code=400, detail="Unsupported file format. Only PDF, TXT, and DOCX are allowed.")
        
    try:
        # 3. Create org path and upload to Supabase storage bucket
        storage_path = f"{resolved_org_id}/{uuid.uuid4()}_{file_name}"
        
        # Uploading
        supabase_client.storage.from_("knowledge-docs").upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": file.content_type}
        )
        
        file_url = supabase_client.storage.from_("knowledge-docs").get_public_url(storage_path)
        
        # 4. Insert database metadata record
        doc_res = supabase_client.table("knowledge_base_documents").insert({
            "org_id": resolved_org_id,
            "file_name": file_name,
            "file_url": file_url,
            "file_type": file.content_type or "text/plain",
            "status": "processing"
        }).execute()
        
        if not doc_res.data:
            raise HTTPException(status_code=500, detail="Failed to write document catalog record.")
            
        doc = doc_res.data[0]
        
        # 5. Queue chunk segmentation and embeddings logic to background task
        background_tasks.add_task(rag_service.process_document, doc["id"], storage_path, resolved_org_id)
        
        return {
            "document_id": doc["id"],
            "status": "processing",
            "message": "File uploaded successfully. Ingestion process running in background."
        }
        
    except Exception as e:
        logger.error(f"Failed to handle document upload: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process upload: {str(e)}")

@router.get("/documents")
async def list_documents(org_id: str = Header(None)):
    """
    Returns all cataloged documentation records for the organization.
    """
    resolved_org_id = get_org_id_from_header(org_id)
    res = supabase_client.table("knowledge_base_documents") \
        .select("id, file_name, file_url, file_type, status, chunk_count, progress_message, error_message, created_at") \
        .eq("org_id", resolved_org_id) \
        .order("created_at", desc=True) \
        .execute()
        
    return res.data or []

@router.get("/documents/{doc_id}/status")
async def get_document_status(doc_id: str, org_id: str = Header(None)):
    """
    Retrieves progress and error tracking status for a specific document ingestion.
    """
    resolved_org_id = get_org_id_from_header(org_id)
    res = supabase_client.table("knowledge_base_documents") \
        .select("id, file_name, status, chunk_count, progress_message, error_message, created_at") \
        .eq("id", doc_id) \
        .eq("org_id", resolved_org_id) \
        .execute()
        
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    return res.data[0]

@router.post("/documents/{doc_id}/retry")
async def retry_document_processing(
    doc_id: str,
    background_tasks: BackgroundTasks,
    org_id: str = Header(None)
):
    """
    Resets status and requeues a failed document for embedding ingestion processing.
    """
    resolved_org_id = get_org_id_from_header(org_id)
    
    # 1. Fetch document metadata
    doc_res = supabase_client.table("knowledge_base_documents") \
        .select("*") \
        .eq("id", doc_id) \
        .eq("org_id", resolved_org_id) \
        .execute()
        
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    doc = doc_res.data[0]
    
    if doc["status"] != "failed":
        raise HTTPException(status_code=400, detail="Only failed documents can be retried.")
        
    try:
        # 2. Delete existing chunks for this document
        supabase_client.table("knowledge_base_chunks") \
            .delete() \
            .eq("doc_id", doc_id) \
            .execute()
            
        # 3. Reset document status
        supabase_client.table("knowledge_base_documents") \
            .update({
                "status": "processing",
                "progress_message": "Queued...",
                "error_message": None,
                "chunk_count": None
            }) \
            .eq("id", doc_id) \
            .execute()
            
        # 4. Extract storage path from public URL
        file_url = doc.get("file_url", "")
        split_marker = "/knowledge-docs/"
        if split_marker not in file_url:
            raise ValueError("Invalid file URL structure.")
            
        storage_path = file_url.split(split_marker)[-1]
        
        # 5. Re-run processing background task
        background_tasks.add_task(rag_service.process_document, doc_id, storage_path, resolved_org_id)
        
        return {"status": "requeued", "message": "Ingestion process restarted."}
        
    except Exception as e:
        logger.error(f"Failed to retry document {doc_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retry processing: {str(e)}")

@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, org_id: str = Header(None)):
    """
    Deletes the vector chunks, storage document node, and catalog records from databases.
    """
    resolved_org_id = get_org_id_from_header(org_id)
    
    # 1. Fetch document record to retrieve storage path
    doc_res = supabase_client.table("knowledge_base_documents") \
        .select("*") \
        .eq("id", doc_id) \
        .eq("org_id", resolved_org_id) \
        .execute()
        
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found.")
        
    doc = doc_res.data[0]
    file_url = doc.get("file_url", "")
    
    try:
        # Extract storage path from public URL
        # URL structure: https://xxxx.supabase.co/storage/v1/object/public/knowledge-docs/{org_id}/uuid_filename
        split_marker = "/knowledge-docs/"
        if split_marker in file_url:
            storage_path = file_url.split(split_marker)[-1]
            # Delete from Supabase Storage
            supabase_client.storage.from_("knowledge-docs").remove([storage_path])
            
        # 2. Delete document database record (cascade deletes chunks automatically)
        supabase_client.table("knowledge_base_documents") \
            .delete() \
            .eq("id", doc_id) \
            .execute()
            
        return {"status": "deleted", "message": "Document and all associated vector chunks removed."}
        
    except Exception as e:
        logger.error(f"Failed to delete document {doc_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete resource: {str(e)}")

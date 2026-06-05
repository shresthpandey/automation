-- Migration: Add real-time status tracking columns to knowledge_base_documents
ALTER TABLE knowledge_base_documents ADD COLUMN IF NOT EXISTS progress_message text DEFAULT 'Queued...';
ALTER TABLE knowledge_base_documents ADD COLUMN IF NOT EXISTS error_message text;

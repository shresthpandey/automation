-- ─────────────────────────────────────────────────────────────────────────────
-- Supabase Row Level Security (RLS) Verification and Enforcement
-- Run this in your Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. VERIFY RLS STATUS FOR ALL PUBLIC TABLES
-- All tables must return true in the 'rowsecurity' column.
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';


-- 2. ENABLE RLS FOR EVERY TABLE (IF ANY RETURNED FALSE ABOVE)
-- Alter table statements to explicitly turn on Row Level Security:

-- Organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Knowledge Base Documents
ALTER TABLE public.knowledge_base_documents ENABLE ROW LEVEL SECURITY;

-- Knowledge Base Document Chunks
ALTER TABLE public.knowledge_base_chunks ENABLE ROW LEVEL SECURITY;

-- Escalations (optional table, uncomment and run if you have created it)
-- ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

-- User Profiles / Auth Accounts
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

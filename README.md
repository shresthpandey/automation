# ConverseOS 🚀

ConverseOS is a production-ready, enterprise-grade omnichannel customer communication platform and AI-agent automation workspace. It integrates **WhatsApp Cloud API**, **Next.js 14**, **FastAPI**, and **Supabase (PostgreSQL with pgvector)** to deliver real-time chat routing, CRM contact management, RAG (Retrieval-Augmented Generation) lookup, and autonomous AI responses.

---

## Folder Structure

```text
converseos/
├── frontend/                    # Next.js 14 App Router (TypeScript)
│   ├── app/                     # App router pages (auth & dashboard groups)
│   ├── components/              # UI, Inbox, Contacts, Shared components
│   ├── lib/                     # API client, Supabase client, utilities
│   ├── types/                   # TypeScript models
│   ├── .env.local.example       # Frontend environment template
│   └── package.json             # Node configuration
│
├── backend/                     # FastAPI App (Python 3.11)
│   ├── app/                     # Main backend code
│   │   ├── routers/             # API routes (webhooks, inbox, etc.)
│   │   ├── services/            # AI Engine, embeddings, WhatsApp API, RAG
│   │   └── models/              # Pydantic data schemas
│   ├── requirements.txt         # Python dependencies
│   ├── .env.example             # Backend environment template
│   └── Dockerfile               # Container build configuration
│
└── README.md                    # Setup & documentation
```

---

## Technical Stack

*   **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide React icons
*   **Backend**: FastAPI, Uvicorn, Python 3.11
*   **Database**: Supabase PostgreSQL with `pgvector` enabled for vector indexing
*   **AI Engine**: OpenAI GPT-4o & text-embedding-ada-002 model
*   **Channels**: WhatsApp Business API Webhooks

---

## Supabase Database Setup

To run ConverseOS, execute the following SQL migration script in your Supabase SQL Editor to provision the tables, foreign keys, and vector search functions:

```sql
-- Enable the pgvector extension for AI RAG embeddings
create extension if not exists vector;

-- 1. Contacts Table
create table public.contacts (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    phone_number text unique not null,
    email text,
    avatar_url text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Conversations Table
create table public.conversations (
    id uuid default gen_random_uuid() primary key,
    contact_id uuid references public.contacts(id) on delete cascade not null,
    status text default 'open'::text check (status in ('open', 'snoozed', 'closed')),
    unread_count integer default 0,
    last_message text,
    last_message_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Messages Table
create table public.messages (
    id uuid default gen_random_uuid() primary key,
    conversation_id uuid references public.conversations(id) on delete cascade not null,
    sender_type text not null check (sender_type in ('customer', 'agent', 'bot')),
    content text not null,
    status text default 'sent'::text check (status in ('sent', 'delivered', 'read')),
    channel text default 'whatsapp'::text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Knowledge Base Documents Table
create table public.documents (
    id uuid default gen_random_uuid() primary key,
    title text not null,
    file_path text,
    content text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Document Chunks Table (for pgvector searches)
create table public.document_chunks (
    id uuid default gen_random_uuid() primary key,
    document_id uuid references public.documents(id) on delete cascade not null,
    content text not null,
    embedding vector(1536), -- 1536 dimensions for OpenAI text-embedding-ada-002
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Indexing for semantic search speed
create index on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Vector Cosine Similarity Match function
create or replace function match_document_chunks (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
language sql stable
as $$
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

---

## Local Setup Instructions

### Backend (FastAPI)

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```
2.  Create a virtual environment and activate it:
    ```bash
    python -m venv venv
    # Windows:
    .\venv\Scripts\activate
    # macOS/Linux:
    source venv/bin/activate
    ```
3.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
4.  Configure `.env` file from the template:
    ```bash
    cp .env.example .env
    ```
5.  Start the dev server:
    ```bash
    uvicorn app.main:app --reload --port 8000
    ```

### Frontend (Next.js)

1.  Navigate to the frontend directory:
    ```bash
    cd ../frontend
    ```
2.  Install packages:
    ```bash
    npm install
    ```
3.  Configure `.env.local` file from the template:
    ```bash
    cp .env.local.example .env.local
    ```
4.  Run Next.js server locally:
    ```bash
    npm run dev
    ```
5.  Visit `http://localhost:3000` to interact with the dashboard.

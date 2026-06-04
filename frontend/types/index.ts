export interface Contact {
  id: string;
  name: string;
  phone_number: string;
  email?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  status: "open" | "snoozed" | "closed" | "resolved" | "pending";
  unread_count: number;
  last_message?: string;
  last_message_at: string;
  created_at: string;
  contact?: Contact;
  assigned_to?: string | null;
  ai_enabled: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: "customer" | "contact" | "agent" | "bot" | "ai";
  content: string;
  status: "sent" | "delivered" | "read";
  channel: string;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  file_path?: string;
  content: string;
  created_at: string;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  embedding: number[];
  created_at: string;
}

export interface AISettings {
  openai_api_key?: string;
  model_name: string;
  temperature: number;
  system_prompt: string;
  is_active: boolean;
}

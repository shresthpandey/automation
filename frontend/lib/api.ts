const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error [${response.status}]: ${errorBody}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  // Conversations
  getConversations: () => request<any[]>("/api/conversations"),
  getMessages: (conversationId: string) => request<any[]>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, content: string, senderType: "agent" | "bot" = "agent") =>
    request<any>(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, sender_type: senderType }),
    }),

  // Contacts
  getContacts: () => request<any[]>("/api/contacts"),
  createContact: (name: string, phone: string, email?: string) =>
    request<any>("/api/contacts", {
      method: "POST",
      body: JSON.stringify({ name, phone_number: phone, email }),
    }),

  // Knowledge Base
  getDocuments: () => request<any[]>("/api/knowledge-base"),
  uploadDocument: (title: string, content: string) =>
    request<any>("/api/knowledge-base", {
      method: "POST",
      body: JSON.stringify({ title, content }),
    }),

  // AI config
  getAISettings: () => request<any>("/api/ai/settings"),
  updateAISettings: (settings: any) =>
    request<any>("/api/ai/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
};

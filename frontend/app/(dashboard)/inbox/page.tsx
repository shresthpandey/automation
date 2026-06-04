"use client";

import * as React from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { Conversation, Message } from "../../../types";
import { ConversationList } from "../../../components/inbox/ConversationList";
import { ChatWindow } from "../../../components/inbox/ChatWindow";
import { supabase } from "../../../lib/supabase";

export default function InboxPage() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [activeId, setActiveId] = React.useState<string>("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoadingConv, setIsLoadingConv] = React.useState(true);
  const [isLoadingMsgs, setIsLoadingMsgs] = React.useState(false);
  
  const activeConversation = conversations.find(c => c.id === activeId);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // 1. Fetch Conversations on Mount
  const fetchConversations = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/conversations`);
      if (response.ok) {
        const data = await response.json();
        setConversations(data);
        if (data.length > 0 && !activeId) {
          setActiveId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to load conversations: ", e);
    } finally {
      setIsLoadingConv(false);
    }
  };

  React.useEffect(() => {
    const initPage = async () => {
      await fetchConversations();
      if (typeof window !== "undefined") {
        const redirectId = localStorage.getItem("converseos_active_conv_id");
        if (redirectId) {
          setActiveId(redirectId);
          localStorage.removeItem("converseos_active_conv_id");
        }
      }
    };
    initPage();
  }, []);

  // 2. Fetch Messages for Selected Thread
  React.useEffect(() => {
    if (!activeId) return;

    const fetchMessages = async () => {
      setIsLoadingMsgs(true);
      try {
        const response = await fetch(`${apiUrl}/api/conversations/${activeId}/messages`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
        }
      } catch (e) {
        console.error("Failed to load messages: ", e);
      } finally {
        setIsLoadingMsgs(false);
      }
    };

    fetchMessages();
  }, [activeId]);

  // 3. Supabase Realtime Subscription for Live Messages updates
  React.useEffect(() => {
    // Subscribe to INSERT changes in messages table
    const channel = supabase.channel("messages-live-sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload: any) => {
          const newMsg = payload.new as Message;
          loggerInfo("Realtime insert message received:", newMsg);

          // Case A: Message belongs to active conversation thread
          if (newMsg.conversation_id === activeId) {
            setMessages((prev) => {
              // De-duplicate check
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }

          // Case B: Update the conversation's last message snippet in thread list
          setConversations((prevList) => {
            const index = prevList.findIndex(c => c.id === newMsg.conversation_id);
            if (index === -1) {
              // Trigger reload if conversation doesn't exist locally
              fetchConversations();
              return prevList;
            }

            const updatedConv = { ...prevList[index] };
            updatedConv.last_message = newMsg.content;
            updatedConv.last_message_at = newMsg.created_at;

            // Increment unread count if message is from customer and thread is not active
            if (newMsg.sender_type === "contact" && newMsg.conversation_id !== activeId) {
              updatedConv.unread_count = (updatedConv.unread_count || 0) + 1;
            }

            const remainder = prevList.filter(c => c.id !== newMsg.conversation_id);
            // Move updated conversation to the top
            return [updatedConv, ...remainder];
          });
        }
      )
      .subscribe((status) => {
        console.log("[InboxRealtime] Subscription status changed to:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  // 4. Send Message Handler
  const handleSendMessage = async (content: string) => {
    if (!activeId) return;

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content,
          sender_type: "agent",
          channel: "whatsapp"
        })
      });

      if (response.ok) {
        // Optimistic UI updates
        const tempMsg: Message = {
          id: `temp-${Date.now()}`,
          conversation_id: activeId,
          sender_type: "agent",
          content,
          status: "sent",
          channel: "whatsapp",
          created_at: new Date().toISOString()
        };

        setMessages((prev) => [...prev, tempMsg]);
        setConversations((prev) => 
          prev.map((c) => c.id === activeId 
            ? { ...c, last_message: content, last_message_at: tempMsg.created_at, unread_count: 0 } 
            : c
          )
        );
      }
    } catch (e) {
      console.error("Error posting message: ", e);
    }
  };

  // 5. Update Conversation Attributes (status, assignee, autopilot)
  const handleUpdateConversation = async (fields: Partial<Conversation>) => {
    if (!activeId) return;

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${activeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(fields)
      });

      if (response.ok) {
        setConversations(prev =>
          prev.map(c => c.id === activeId ? { ...c, ...fields } : c)
        );
      }
    } catch (e) {
      console.error("Error updating conversation: ", e);
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveId(id);
    // Mark as read locally on select
    setConversations(prev =>
      prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c)
    );
    // Trigger reset query to DB
    fetch(`${apiUrl}/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unread_count: 0 })
    }).catch(e => console.error("Failed to reset unread count: ", e));
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] rounded-xl border border-border bg-card/25 backdrop-blur-md overflow-hidden glow-indigo">
      
      {/* 1. Conversation List column */}
      {isLoadingConv ? (
        <div className="w-80 border-r border-border flex items-center justify-center bg-background/50 h-full">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelectConversation}
        />
      )}

      {/* 2. Primary Chat Window column */}
      {activeId && activeConversation ? (
        isLoadingMsgs ? (
          <div className="flex-1 flex items-center justify-center bg-background/25">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <ChatWindow
            conversation={activeConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onUpdateConversation={handleUpdateConversation}
          />
        )
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground select-none bg-background/25">
          <div className="p-4 rounded-full bg-muted/20 border border-border/50 mb-3 animate-bounce">
            <MessageSquare className="h-8 w-8 text-primary/70" />
          </div>
          <h3 className="font-semibold text-sm">No Thread Selected</h3>
          <p className="text-xs text-muted-foreground max-w-xs text-center mt-1">
            Pick a customer chat thread from the left list to start replying and automating workflows.
          </p>
        </div>
      )}
    </div>
  );
}

// Log utility
function loggerInfo(msg: string, arg?: any) {
  console.log(`[InboxRealtime] ${msg}`, arg);
}

"use client";

import * as React from "react";
import { Conversation, Message } from "../../../types";
import { ConversationList } from "../../../components/inbox/ConversationList";
import { ChatWindow } from "../../../components/inbox/ChatWindow";
import { supabase } from "../../../lib/supabase";
import { useInboxNavigation } from "../../../hooks/useInboxNavigation";

export default function InboxPage() {
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoadingConv, setIsLoadingConv] = React.useState(true);
  const [isErrorConv, setIsErrorConv] = React.useState(false);
  const [isLoadingMsgs, setIsLoadingMsgs] = React.useState(false);

  const {
    currentView,
    selectedConversationId: activeId,
    selectConversation,
    goBack: handleBack,
    isMobile
  } = useInboxNavigation("");
  
  const activeConversation = conversations.find(c => c.id === activeId);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // Prevent parent scroll bouncing on mobile
  React.useEffect(() => {
    if (isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile]);

  // 1. Fetch Conversations on Mount
  const fetchConversations = async () => {
    setIsErrorConv(false);
    try {
      const response = await fetch(`${apiUrl}/api/conversations`);
      if (response.ok) {
        const data: Conversation[] = await response.json();
        setConversations(data);
        // ONLY auto-select the first conversation on desktop/tablet to prevent immediate slide on mobile
        if (data.length > 0 && !activeId && !isMobile) {
          selectConversation(data[0].id);
        }
      } else {
        setIsErrorConv(true);
      }
    } catch (e) {
      console.error("Failed to load conversations: ", e);
      setIsErrorConv(true);
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
          selectConversation(redirectId);
          localStorage.removeItem("converseos_active_conv_id");
        }
      }
    };
    initPage();
  }, [isMobile]);

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
              // Remove temporary sending message if match content
              const filtered = prev.filter(
                (m) => !(m.status === "sending" && m.content === newMsg.content)
              );
              return [...filtered, newMsg];
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

  // 4. Send Message Handler (Optimistic UI updates)
  const handleSendMessage = async (content: string) => {
    if (!activeId) return;

    // Create optimistic message
    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversation_id: activeId,
      sender_type: "agent",
      content,
      status: "sending",
      channel: activeConversation?.channel || "whatsapp",
      created_at: new Date().toISOString()
    };

    // Append to messages list immediately
    setMessages((prev) => [...prev, tempMsg]);

    // Update conversation last message snippet immediately
    setConversations((prev) => 
      prev.map((c) => c.id === activeId 
        ? { ...c, last_message: content, last_message_at: tempMsg.created_at, unread_count: 0 } 
        : c
      )
    );

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content,
          sender_type: "agent",
          channel: activeConversation?.channel || "whatsapp"
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Replace temp message with actual saved message from database
        setMessages((prev) => 
          prev.map((m) => m.id === tempId ? { ...data, status: "sent" } : m)
        );
      } else {
        // Mark as failed in UI
        setMessages((prev) => 
          prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m)
        );
      }
    } catch (e) {
      console.error("Error posting message: ", e);
      // Mark as failed in UI
      setMessages((prev) => 
        prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m)
      );
    }
  };

  // 5. Retry Sending Failed Message
  const handleRetrySendMessage = async (content: string, id: string) => {
    // Mark as sending again
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "sending" } : m))
    );

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${activeId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          content,
          sender_type: "agent",
          channel: activeConversation?.channel || "whatsapp"
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Update status to sent and swap with DB returned message
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...data, status: "sent" } : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, status: "failed" } : m))
        );
      }
    } catch (e) {
      console.error("Error retrying message: ", e);
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "failed" } : m))
      );
    }
  };

  // 6. Update Conversation Attributes (status, assignee, autopilot)
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
    selectConversation(id);
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
    <div className="flex h-[calc(100vh-4rem)] md:h-[calc(100vh-8rem)] rounded-none md:rounded-xl border-0 md:border border-border bg-card/25 backdrop-blur-md overflow-hidden glow-indigo">
      
      {/* 1. Conversation List column */}
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        isLoading={isLoadingConv}
        isError={isErrorConv}
        onRetry={fetchConversations}
        currentView={currentView}
      />

      {/* 2. Primary Chat Window column */}
      <ChatWindow
        conversation={activeConversation}
        messages={messages}
        onSendMessage={handleSendMessage}
        onUpdateConversation={handleUpdateConversation}
        isLoadingMessages={isLoadingMsgs}
        onRetrySend={handleRetrySendMessage}
        currentView={currentView}
        onBack={handleBack}
      />
    </div>
  );
}

// Log utility
function loggerInfo(msg: string, arg?: any) {
  console.log(`[InboxRealtime] ${msg}`, arg);
}

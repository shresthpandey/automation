"use client";

import * as React from "react";
import { UserCheck, RefreshCw, Smartphone } from "lucide-react";
import { Conversation, Message } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { ReplyBox } from "./ReplyBox";
import { Button } from "../ui/button";

interface ChatWindowProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onUpdateConversation: (fields: Partial<Conversation>) => Promise<void>;
}

export function ChatWindow({ conversation, messages, onSendMessage, onUpdateConversation }: ChatWindowProps) {
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Auto-scroll to chat bottom on new messages
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const contact = conversation.contact || { name: "Customer", phone_number: "", lead_score: 0 };
  const leadScore = (contact as any).lead_score !== undefined ? (contact as any).lead_score : 10;
  
  // Simulated Agent login profile ID
  const dummyAgentId = "00000000-0000-0000-0000-000000000000"; 
  const isAssignedToMe = conversation.assigned_to === dummyAgentId;

  const handleAssignToMe = async () => {
    setIsUpdating(true);
    try {
      await onUpdateConversation({
        assigned_to: isAssignedToMe ? "" : dummyAgentId
      });
    } catch (e) {
      console.error("Assign error: ", e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setIsUpdating(true);
    try {
      await onUpdateConversation({
        status: e.target.value as any
      });
    } catch (err) {
      console.error("Status update error: ", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const getLeadScoreStyles = (score: number) => {
    if (score > 70) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (score > 40) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  // Helper to determine date headers
  const getMessageDateHeader = (msgDateStr: string, prevDateStr?: string) => {
    const msgDate = new Date(msgDateStr);
    const msgDateLocalDate = msgDate.toLocaleDateString();
    
    if (prevDateStr && new Date(prevDateStr).toLocaleDateString() === msgDateLocalDate) {
      return undefined; // Same date, no separator
    }
    
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    
    if (msgDateLocalDate === today) return "Today";
    if (msgDateLocalDate === yesterday) return "Yesterday";
    
    return msgDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background/25">
      {/* Top Header bar */}
      <div className="p-4 border-b border-border bg-card/35 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm">
            {contact.name[0] || "C"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm leading-tight">{contact.name}</h3>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold select-none ${getLeadScoreStyles(leadScore)}`}>
                Score: {leadScore}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 font-mono">
              <Smartphone className="h-3 w-3 text-muted-foreground" /> {contact.phone_number}
            </span>
          </div>
        </div>

        {/* Quick settings/assign */}
        <div className="flex items-center gap-3">
          {/* Status Selection */}
          <select
            value={conversation.status}
            onChange={handleStatusChange}
            disabled={isUpdating}
            className="bg-muted/40 border border-border text-xs rounded-lg px-2.5 py-1.5 focus-visible:outline-none focus:border-primary/80 transition-colors font-medium text-foreground cursor-pointer"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="closed">Resolved</option>
          </select>

          {/* Assign to me toggle */}
          <Button
            onClick={handleAssignToMe}
            disabled={isUpdating}
            variant={isAssignedToMe ? "secondary" : "default"}
            size="sm"
            className="h-8 text-xs font-semibold flex items-center gap-1.5 select-none"
          >
            {isUpdating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            {isAssignedToMe ? "Assigned to You" : "Assign to me"}
          </Button>
        </div>
      </div>

      {/* Messages logs (scrollable) */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.length > 0 ? (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : undefined;
            const dateHeader = getMessageDateHeader(msg.created_at, prevMsg?.created_at);
            
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                dateHeader={dateHeader}
              />
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground italic h-48 select-none">
            No messages in this conversation.
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Reply toolbar */}
      <ReplyBox
        conversationId={conversation.id}
        aiEnabled={conversation.ai_enabled}
        onSend={onSendMessage}
        onToggleAI={(enabled) => onUpdateConversation({ ai_enabled: enabled })}
      />
    </div>
  );
}

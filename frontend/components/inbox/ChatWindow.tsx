"use client";

import * as React from "react";
import { UserCheck, RefreshCw, Smartphone, MessageSquare, ArrowLeft } from "lucide-react";
import { Conversation, Message } from "../../types";
import { MessageBubble } from "./MessageBubble";
import { ReplyBox } from "./ReplyBox";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface ChatWindowProps {
  conversation?: Conversation | null;
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  onUpdateConversation: (fields: Partial<Conversation>) => Promise<void>;
  isLoadingMessages?: boolean;
  onRetrySend?: (content: string, id: string) => void;
  currentView?: "list" | "chat";
  onBack?: () => void;
}

export function ChatWindow({
  conversation,
  messages,
  onSendMessage,
  onUpdateConversation,
  isLoadingMessages = false,
  onRetrySend,
  currentView = "list",
  onBack,
}: ChatWindowProps) {
  const chatEndRef = React.useRef<HTMLDivElement>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Swipe detection coordinates
  const [touchStart, setTouchStart] = React.useState<number | null>(null);
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null);

  // Auto-scroll to chat bottom on new messages
  React.useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoadingMessages]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchEnd - touchStart;
    const isLeftToRightSwipe = distance > 140; // Swipe right at least 140px to trigger goBack
    if (isLeftToRightSwipe && onBack) {
      onBack();
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const windowContainerClass = cn(
    "flex-1 flex flex-col h-full bg-background/25 transition-all duration-300",
    currentView === "chat" ? "flex" : "hidden md:flex"
  );

  // If no conversation is active
  if (!conversation) {
    return (
      <div className={cn("flex-1 flex flex-col items-center justify-center relative bg-background/25 overflow-hidden", currentView === "chat" ? "flex" : "hidden md:flex")}>
        {/* Subtle grid background pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(128,128,128,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(128,128,128,0.05)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        <div className="flex flex-col items-center justify-center text-center p-8 select-none max-w-sm relative z-10">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden h-11 w-11 flex items-center justify-center rounded-xl bg-muted/50 text-muted-foreground hover:text-foreground absolute top-4 left-4 border border-border/50"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="h-16 w-16 rounded-3xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6 border border-white/10 relative overflow-hidden group">
            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <MessageSquare className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-indigo-200 to-purple-400 bg-clip-text text-transparent">
            ConverseOS
          </h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-[280px]">
            Select a conversation to start replying and automating workflows.
          </p>
        </div>
      </div>
    );
  }

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
    <div 
      className={windowContainerClass}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Header bar */}
      <div className="p-4 border-b border-border bg-card/35 backdrop-blur-md flex items-center justify-between shrink-0 min-h-[60px]">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="md:hidden h-11 w-11 flex items-center justify-center rounded-xl bg-muted/40 text-muted-foreground hover:text-foreground border border-border/40 mr-1 shrink-0"
              aria-label="Back to conversations list"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm select-none shrink-0">
              {contact.name[0] || "C"}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm leading-tight truncate max-w-[120px] sm:max-w-none">{contact.name}</h3>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold select-none shrink-0 ${getLeadScoreStyles(leadScore)}`}>
                  Score: {leadScore}
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 font-mono truncate">
                <Smartphone className="h-3 w-3 text-muted-foreground shrink-0" /> {contact.phone_number}
              </span>
            </div>
          </div>
        </div>

        {/* Quick settings/assign */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Status Selection */}
          <select
            value={conversation.status}
            onChange={handleStatusChange}
            disabled={isUpdating}
            className="bg-muted/40 border border-border text-xs rounded-lg px-2.5 py-2.5 focus-visible:outline-none focus:border-primary/80 transition-colors font-medium text-foreground cursor-pointer min-h-[44px]"
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
            className="h-11 text-xs font-semibold flex items-center gap-1.5 select-none"
          >
            {isUpdating ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{isAssignedToMe ? "Assigned to You" : "Assign to me"}</span>
            <span className="sm:hidden">{isAssignedToMe ? "You" : "Assign"}</span>
          </Button>
        </div>
      </div>

      {/* Messages logs (scrollable) */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {isLoadingMessages ? (
          // Alternating Skeletons to mimic actual message bubbles
          <div className="space-y-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
              const isLeft = i % 2 !== 0;
              return (
                <div key={i} className={`flex w-full ${isLeft ? "justify-start" : "justify-end"}`}>
                  <div className={`w-2/3 max-w-[60%] space-y-1.5 ${isLeft ? "text-left" : "text-right"}`}>
                    <div
                      className={`h-12 animate-pulse bg-gray-200 dark:bg-gray-700 ${
                        isLeft ? "rounded-2xl rounded-tl-none" : "rounded-2xl rounded-tr-none"
                      }`}
                    />
                    <div className={`flex items-center gap-2 px-1 ${isLeft ? "justify-start" : "justify-end"}`}>
                      <div className="h-2 w-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : messages.length > 0 ? (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : undefined;
            const dateHeader = getMessageDateHeader(msg.created_at, prevMsg?.created_at);
            
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                dateHeader={dateHeader}
                onRetrySend={onRetrySend}
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

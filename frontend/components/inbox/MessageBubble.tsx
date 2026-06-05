"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Message } from "../../types";

interface MessageBubbleProps {
  message: Message & { ai_confidence?: number };
  dateHeader?: string;
  onRetrySend?: (content: string, id: string) => void;
}

export function MessageBubble({ message, dateHeader, onRetrySend }: MessageBubbleProps) {
  const isContact = message.sender_type === "contact" || message.sender_type === "customer";
  const isAI = message.sender_type === "ai" || message.sender_type === "bot";
  const isAgent = message.sender_type === "agent";

  // Parse time string elegantly
  const formatTime = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch (e) {
      return timeStr;
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Optional Date Header Separator */}
      {dateHeader && (
        <div className="flex items-center justify-center my-6">
          <div className="h-px bg-border flex-1" />
          <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-4 bg-background/40 py-1 rounded-full border border-border/50">
            {dateHeader}
          </span>
          <div className="h-px bg-border flex-1" />
        </div>
      )}

      {/* Message Row */}
      <div className={`flex w-full ${isContact ? "justify-start" : "justify-end"}`}>
        <div className={`max-w-[85%] md:max-w-[70%] space-y-1 ${isContact ? "text-left" : "text-right"}`}>
          {/* Main Bubble */}
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm transition-all duration-200 ${
              isContact
                ? "bg-muted text-foreground rounded-tl-none border border-border/50"
                : message.status === "failed"
                ? "bg-rose-950/20 text-rose-200 border border-rose-500/30 rounded-tr-none shadow-md shadow-rose-950/10"
                : isAgent
                ? "bg-primary text-primary-foreground rounded-tr-none shadow-md shadow-primary/10"
                : "bg-indigo-950/40 text-foreground border border-indigo-500/20 rounded-tr-none shadow-lg shadow-indigo-500/5 backdrop-blur-md"
            }`}
          >
            {/* AI badge / metadata header */}
            {isAI && (
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-indigo-400 font-bold mb-1 select-none">
                <Sparkles className="h-3 w-3 fill-current" /> 
                AI Co-Pilot 
                {message.ai_confidence !== undefined && (
                  <span className="text-indigo-400/80 lowercase font-medium">
                     ({Math.round(message.ai_confidence * 100)}% confidence)
                  </span>
                )}
              </div>
            )}
            
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>

          {/* Time Stamp & Status/Retry links */}
          <div className={`flex items-center gap-2 px-1 ${isContact ? "justify-start" : "justify-end"}`}>
            <span className="text-[9px] text-muted-foreground font-medium select-none">
              {formatTime(message.created_at)}
            </span>
            {message.status === "sending" && (
              <span className="text-[9px] text-primary/70 animate-pulse font-medium select-none">
                sending...
              </span>
            )}
            {message.status === "failed" && onRetrySend && (
              <button
                onClick={() => onRetrySend(message.content, message.id)}
                className="text-[9px] text-rose-500 font-bold hover:underline select-none"
              >
                Failed to send. Retry?
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

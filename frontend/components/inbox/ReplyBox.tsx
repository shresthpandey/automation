"use client";

import * as React from "react";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "../ui/button";

interface ReplyBoxProps {
  conversationId: string;
  aiEnabled: boolean;
  onSend: (message: string) => Promise<void>;
  onToggleAI: (enabled: boolean) => Promise<void>;
}

export function ReplyBox({ conversationId, aiEnabled, onSend, onToggleAI }: ReplyBoxProps) {
  const [text, setText] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isSuggesting, setIsSuggesting] = React.useState(false);
  
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  const handleSend = async () => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSend(text);
      setText("");
    } catch (e) {
      console.error("Failed to send message: ", e);
    } finally {
      setIsSending(false);
    }
  };

  const handleFetchSuggestion = async () => {
    if (isSuggesting) return;
    setIsSuggesting(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${apiUrl}/api/conversations/${conversationId}/suggest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.reply) {
          setText(data.reply);
        }
      }
    } catch (e) {
      console.error("Failed to fetch AI suggestions: ", e);
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="p-4 border-t border-border bg-card/30 backdrop-blur-md space-y-3">
      {/* Configuration bar */}
      <div className="flex justify-between items-center text-xs">
        {/* Toggle auto reply */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => onToggleAI(e.target.checked)}
            className="sr-only"
          />
          <span className={`h-4.5 w-9 rounded-full transition-colors relative flex items-center px-0.5 ${
            aiEnabled ? "bg-indigo-500" : "bg-muted"
          }`}>
            <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              aiEnabled ? "translate-x-4.5" : "translate-x-0"
            }`} />
          </span>
          <span className="font-semibold text-muted-foreground">AI Auto-reply</span>
        </label>

        {/* Suggestion action & Character Counter */}
        <div className="flex items-center gap-3">
          <span className={`font-medium text-[10px] sm:text-xs tracking-wider transition-colors ${
            text.length >= 4096 ? "text-rose-500 font-bold" : "text-muted-foreground/80"
          }`}>
            {text.length} / 4096
          </span>
          <Button
            onClick={handleFetchSuggestion}
            disabled={isSuggesting}
            variant="outline"
            size="sm"
            className="h-8 border-indigo-500/20 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 text-xs flex items-center gap-1.5 shadow-sm"
          >
            {isSuggesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 fill-current" />
            )}
            AI Suggestion
          </Button>
        </div>
      </div>

      {/* Inputs toolbar */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          maxLength={4096}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your reply here..."
          className="flex-1 bg-muted/40 border border-border/80 rounded-xl px-3.5 py-2 text-sm shadow-inner placeholder:text-muted-foreground focus-visible:outline-none focus:border-primary/80 transition-colors resize-none overflow-hidden max-h-36 min-h-[40px] leading-relaxed"
        />
        
        <Button
          onClick={handleSend}
          disabled={!text.trim() || text.length > 4096 || isSending}
          className="h-10 w-10 shrink-0 rounded-xl bg-primary text-white hover:opacity-90 shadow-md transition-opacity"
        >
          {isSending ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          ) : (
            <Send className="h-4.5 w-4.5" />
          )}
        </Button>
      </div>
    </div>
  );
}

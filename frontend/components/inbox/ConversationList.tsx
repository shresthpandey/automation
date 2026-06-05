"use client";

import * as React from "react";
import { Search, MessageSquare, Phone, Filter } from "lucide-react";
import { Input } from "../ui/input";
import { Conversation } from "../../types";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";
import { cn } from "../../lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  currentView?: "list" | "chat";
}

type FilterType = "all" | "open" | "resolved" | "mine";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  isLoading = false,
  isError = false,
  onRetry,
  currentView = "list",
}: ConversationListProps) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<FilterType>("all");

  // Format timestamp to "X ago" or time string
  const formatTimeAgo = (timeStr: string) => {
    try {
      const date = new Date(timeStr);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 3600000);
      
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch (e) {
      return timeStr;
    }
  };

  const getLeadScoreStyles = (score: number) => {
    if (score > 70) {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
    if (score > 40) {
      return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    }
    return "bg-red-500/10 text-red-400 border-red-500/20";
  };

  const getLeadStatusLabel = (score: number) => {
    if (score > 70) return `Hot (${score})`;
    if (score > 40) return `Warm (${score})`;
    return `Cold (${score})`;
  };

  const clearFilters = () => {
    setSearch("");
    setFilter("all");
  };

  // Filter & Search logic
  const filteredConversations = conversations.filter((conv) => {
    const contact = conv.contact || { name: "", phone_number: "", email: "" };
    
    // Search filter
    const matchesSearch = 
      contact.name.toLowerCase().includes(search.toLowerCase()) ||
      (contact.phone_number || "").includes(search) ||
      (conv.last_message || "").toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

    // Tab filter
    if (filter === "open") return conv.status === "open";
    if (filter === "resolved") return conv.status === "closed" || conv.status === "resolved";
    
    // Simulated "mine" status
    if (filter === "mine") return conv.status === "open"; 

    return true;
  });

  const listContainerClass = cn(
    "w-full md:w-80 md:border-r border-border flex flex-col bg-background/50 h-full shrink-0 transition-all duration-300",
    currentView === "list" ? "flex" : "hidden md:flex"
  );

  // LOADING State
  if (isLoading) {
    return (
      <div className={listContainerClass}>
        <div className="p-4 border-b border-border shrink-0">
          <div className="h-9 bg-muted/40 border border-border/30 rounded-xl animate-pulse" />
        </div>
        <div className="flex border-b border-border bg-muted/10 shrink-0 h-10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex-1 border-r border-border/20 bg-muted/5 animate-pulse" />
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200 dark:bg-gray-700" />
              <div className="flex-1 space-y-2 py-1">
                <div className="flex justify-between">
                  <div className="h-3.5 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/6" />
                </div>
                <div className="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ERROR State
  if (isError) {
    return (
      <div className={listContainerClass}>
        <div className="flex-1 flex items-center justify-center p-4">
          <ErrorState message="Failed to load conversations" onRetry={onRetry} />
        </div>
      </div>
    );
  }

  // EMPTY State (No conversations at all)
  if (conversations.length === 0) {
    return (
      <div className={listContainerClass}>
        <div className="p-4 border-b border-border shrink-0">
          <div className="h-9 bg-muted/40 border border-border/30 rounded-xl" />
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <EmptyState
            icon={MessageSquare}
            title="No conversations yet"
            description="Connect your WhatsApp and start receiving messages."
          />
        </div>
      </div>
    );
  }

  return (
    <div className={listContainerClass}>
      {/* Search Bar header */}
      <div className="p-4 border-b border-border space-y-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 bg-muted/40 border-none h-9 focus-visible:ring-1 focus-visible:ring-primary text-base md:text-sm"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border bg-muted/10 shrink-0 select-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {(["all", "open", "resolved", "mine"] as FilterType[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-3 md:py-2.5 text-center border-b-2 transition-all min-h-[44px] md:min-h-0 flex items-center justify-center ${
              filter === tab
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Threads list */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40">
        {filteredConversations.length > 0 ? (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeId;
            const contact = conv.contact || { name: "WhatsApp User", phone_number: "", lead_score: 0 };
            const initials = contact.name.split(" ").map(n => n[0]).join("").substring(0, 2);
            
            // Default score to map badge styles
            const score = (contact as any).lead_score !== undefined ? (contact as any).lead_score : 10;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full p-4 text-left transition-colors flex gap-3 relative min-h-[72px]",
                  isActive ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-muted/20"
                )}
              >
                {/* Contact Initials Avatar */}
                <div className="h-10 w-10 shrink-0 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center text-xs font-semibold select-none">
                  {initials || "WA"}
                </div>

                {/* Conversation Meta */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-sm truncate">{contact.name}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatTimeAgo(conv.last_message_at)}
                    </span>
                  </div>

                  {/* Phone + Score indicator */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">
                      {contact.phone_number}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold select-none ${getLeadScoreStyles(score)}`}>
                      {getLeadStatusLabel(score)}
                    </span>
                  </div>

                  {/* Message snippet */}
                  <p className="text-xs text-muted-foreground truncate w-full">
                    {conv.last_message || "No messages yet"}
                  </p>
                </div>

                {/* Unread badge & Channel Icon indicator */}
                <div className="flex flex-col items-end justify-between shrink-0 select-none">
                  {/* Whatsapp logo indicator */}
                  <div className="rounded-full bg-emerald-500/10 text-emerald-400 p-0.5 border border-emerald-500/25">
                    <Phone className="h-3 w-3" />
                  </div>
                  
                  {conv.unread_count > 0 && (
                    <span className="h-4.5 min-w-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center animate-pulse">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        ) : (
          <div className="h-full flex items-center justify-center p-4">
            <EmptyState
              icon={Filter}
              title="No conversations match this filter"
              description="Try a different filter or search term."
              action={{ label: "Clear filters", onClick: clearFilters }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

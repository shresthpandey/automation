"use client";

import { MessageSquareOff } from "lucide-react";

export function InboxEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-3">
      <div className="p-4 rounded-full bg-muted/20 text-muted-foreground">
        <MessageSquareOff className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm">No Thread Selected</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Select an active customer conversation from the list to start messaging.
        </p>
      </div>
    </div>
  );
}

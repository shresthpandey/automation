"use client";

import { UserMinus } from "lucide-react";

export function ContactsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
      <div className="p-4 rounded-full bg-muted/20 text-muted-foreground">
        <UserMinus className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <h3 className="font-semibold text-sm">No Contacts Cataloged</h3>
        <p className="text-xs text-muted-foreground max-w-xs">
          Manually add a contact profile or connect a channel webhook to sync incoming chats.
        </p>
      </div>
    </div>
  );
}

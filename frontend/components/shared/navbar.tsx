"use client";

import { Bell, Search, Zap } from "lucide-react";
import { Input } from "../ui/input";

export function Navbar() {
  return (
    <header className="sticky top-0 z-10 flex h-14 w-full items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-6 shadow-sm">
      {/* Quick Search */}
      <div className="relative w-64 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search converses or contacts..."
          className="pl-8 bg-muted/40 border-none focus-visible:ring-1 focus-visible:ring-primary h-9"
        />
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 pulse-glow-emerald" />
          WhatsApp Webhook Active
        </div>

        {/* AI Agent Status */}
        <div className="flex items-center gap-1 bg-indigo-500/15 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg px-2 py-1 text-xs font-semibold">
          <Zap className="h-3.5 w-3.5 fill-current" />
          AI Copilot: Online
        </div>

        {/* Notifications */}
        <button className="relative rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="h-4.5 w-4.5" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}

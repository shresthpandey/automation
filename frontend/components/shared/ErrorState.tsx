"use client";

import * as React from "react";
import { ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto select-none">
      <div className="p-4 rounded-full bg-rose-500/10 border border-rose-500/25 mb-4 text-rose-500">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h3 className="font-semibold text-sm text-foreground">Something went wrong</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 text-xs flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try Again
        </Button>
      )}
    </div>
  );
}

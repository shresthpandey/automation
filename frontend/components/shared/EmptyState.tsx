"use client";

import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "../ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-sm mx-auto select-none">
      <div className="p-4 rounded-full bg-muted/20 border border-border/50 mb-4 text-primary/70">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1 mb-4 leading-relaxed">
        {description}
      </p>
      {action && (
        <Button
          onClick={action.onClick}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-md"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

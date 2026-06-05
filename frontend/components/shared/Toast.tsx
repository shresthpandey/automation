"use client";

import * as React from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((message: string, type: ToastType = "info", duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9);
    const defaultDuration = type === "error" ? 5000 : 3000;
    const resolvedDuration = duration || defaultDuration;

    setToasts((prev) => [...prev, { id, type, message, duration: resolvedDuration }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, resolvedDuration);
  }, []);

  const success = React.useCallback((message: string, duration?: number) => {
    addToast(message, "success", duration);
  }, [addToast]);

  const error = React.useCallback((message: string, duration?: number) => {
    addToast(message, "error", duration);
  }, [addToast]);

  const info = React.useCallback((message: string, duration?: number) => {
    addToast(message, "info", duration);
  }, [addToast]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast: addToast, success, error, info }}>
      {children}
      <Toaster toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function Toaster({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => {
        let bgClass = "";
        let borderClass = "";
        let textClass = "";
        let Icon = Info;

        if (t.type === "success") {
          bgClass = "bg-emerald-500/10 dark:bg-emerald-500/10";
          borderClass = "border-emerald-500/25";
          textClass = "text-emerald-500 dark:text-emerald-400";
          Icon = CheckCircle;
        } else if (t.type === "error") {
          bgClass = "bg-rose-500/10 dark:bg-rose-500/10";
          borderClass = "border-rose-500/25";
          textClass = "text-rose-500 dark:text-rose-400";
          Icon = AlertCircle;
        } else {
          bgClass = "bg-blue-500/10 dark:bg-blue-500/10";
          borderClass = "border-blue-500/25";
          textClass = "text-blue-500 dark:text-blue-400";
          Icon = Info;
        }

        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-3.5 rounded-xl border ${bgClass} ${borderClass} shadow-lg backdrop-blur-md transition-all duration-300 animate-slide-in`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${textClass}`} />
            <div className="flex-1 text-xs font-semibold text-foreground leading-normal">
              {t.message}
            </div>
            <button
              onClick={() => onRemove(t.id)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-md hover:bg-muted/30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

import { useState, useEffect } from "react";
import { useToast } from "../components/shared/Toast";

export interface DocumentStatus {
  id: string;
  file_name: string;
  status: "processing" | "ready" | "failed";
  chunk_count: number | null;
  progress_message: string | null;
  error_message: string | null;
  created_at: string;
}

export function useDocumentPolling(docId: string | null, onComplete?: () => void) {
  const [status, setStatus] = useState<DocumentStatus | null>(null);
  const { success: showSuccess, error: showError } = useToast();

  useEffect(() => {
    if (!docId) {
      setStatus(null);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    const poll = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/knowledge-base/documents/${docId}/status`);
        if (res.ok) {
          const data: DocumentStatus = await res.json();
          setStatus(data);

          if (data.status === "ready") {
            clearInterval(interval);
            showSuccess(`✅ ${data.file_name} is ready! AI can now answer questions from it.`);
            if (onComplete) onComplete();
          } else if (data.status === "failed") {
            clearInterval(interval);
            showError(`❌ Failed to process ${data.file_name}. Please retry or try a different file.`);
            if (onComplete) onComplete();
          }
        }
      } catch (err) {
        console.error("Error polling document status:", err);
      }
    };

    poll(); // Immediate check
    const interval = setInterval(poll, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [docId]);

  return status;
}

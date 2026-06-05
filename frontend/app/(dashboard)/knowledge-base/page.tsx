"use client";

import * as React from "react";
import { BookOpen, Upload, FileText, CheckCircle2, RefreshCw, XCircle, Trash2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { useToast } from "../../../components/shared/Toast";
import { useDocumentPolling } from "../../../hooks/useDocumentPolling";

interface DocumentRecord {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  status: "processing" | "ready" | "failed";
  chunk_count: number | null;
  progress_message: string | null;
  error_message: string | null;
  created_at: string;
}

type UploadState = "idle" | "dragging" | "uploading" | "processing" | "ready" | "failed";

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = React.useState<DocumentRecord[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = React.useState(true);
  const [uploadState, setUploadState] = React.useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = React.useState(0);
  const [uploadError, setUploadError] = React.useState("");
  const [readyChunks, setReadyChunks] = React.useState(0);
  const [currentFile, setCurrentFile] = React.useState<File | null>(null);
  
  const [activePollId, setActivePollId] = React.useState<string | null>(null);

  const { success, error, info } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  // 1. Hook up useDocumentPolling to track active upload status
  const activeStatus = useDocumentPolling(activePollId, () => {
    // When done polling, refresh list and reset active poll
    fetchDocuments(true);
    setActivePollId(null);
  });

  // 2. Sync activeStatus changes to uploader zone
  React.useEffect(() => {
    if (activeStatus) {
      if (activeStatus.status === "ready") {
        setReadyChunks(activeStatus.chunk_count || 0);
        setUploadState("ready");
        setTimeout(() => {
          setUploadState("idle");
          setCurrentFile(null);
          setUploadProgress(0);
        }, 4000);
      } else if (activeStatus.status === "failed") {
        setUploadState("failed");
        setUploadError(activeStatus.error_message || "Ingestion failed.");
      }
    }
  }, [activeStatus]);

  // 3. Fetch Documents Catalog
  const fetchDocuments = async (silent = false) => {
    if (!silent) setIsLoadingDocs(true);
    try {
      const response = await fetch(`${apiUrl}/api/knowledge-base/documents`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      } else {
        error("Failed to load documents catalog");
      }
    } catch (err) {
      console.error("Error loading documents:", err);
      error("Failed to load documents catalog");
    } finally {
      if (!silent) setIsLoadingDocs(false);
    }
  };

  React.useEffect(() => {
    fetchDocuments();
  }, []);

  // 4. Background check: Silent reload list if ANY document in catalog is "processing"
  React.useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === "processing");
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchDocuments(true); // Silent reload
    }, 2000);

    return () => clearInterval(interval);
  }, [documents]);

  // 5. Document upload pipeline
  const processUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf" && ext !== "txt" && ext !== "docx") {
      error("Only PDF, TXT, and DOCX files are supported.");
      setUploadState("idle");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      error("File exceeds the 10MB limit.");
      setUploadState("idle");
      return;
    }

    setCurrentFile(file);
    setUploadState("uploading");
    setUploadProgress(10);

    // Simulate progress bar animation
    const progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressTimer);
          return 90;
        }
        return prev + 15;
      });
    }, 100);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiUrl}/api/knowledge-base/upload`, {
        method: "POST",
        body: formData
      });

      clearInterval(progressTimer);
      setUploadProgress(100);

      if (response.ok) {
        const data = await response.json();
        // Set active poll ID to begin polling via useDocumentPolling
        setTimeout(() => {
          setUploadState("processing");
          setActivePollId(data.document_id);
          fetchDocuments(true);
        }, 300);
      } else {
        const errorData = await response.json();
        setUploadState("failed");
        setUploadError(errorData.detail || "Upload failed. Please check backend config.");
      }
    } catch (err) {
      clearInterval(progressTimer);
      console.error("Upload error:", err);
      setUploadState("failed");
      setUploadError("Network error. Ingestion failed.");
    }
  };

  // 6. Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadState === "idle" || uploadState === "dragging") {
      setUploadState("dragging");
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadState === "dragging") {
      setUploadState("idle");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (uploadState === "dragging") {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        processUpload(files[0]);
      } else {
        setUploadState("idle");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processUpload(files[0]);
    }
  };

  const triggerBrowse = () => {
    fileInputRef.current?.click();
  };

  // 7. Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document? All vector chunks will be lost.")) return;
    try {
      const response = await fetch(`${apiUrl}/api/knowledge-base/documents/${id}`, {
        method: "DELETE"
      });
      if (response.ok) {
        success("Document deleted");
        fetchDocuments(true);
      } else {
        error("Failed to delete document");
      }
    } catch (err) {
      console.error("Delete error:", err);
      error("Failed to delete document");
    }
  };

  // 8. Retry Ingestion
  const handleRetryDoc = async (id: string) => {
    try {
      // Optimistic update in list
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, status: "processing", progress_message: "Queued...", error_message: null, chunk_count: null }
            : d
        )
      );
      
      const response = await fetch(`${apiUrl}/api/knowledge-base/documents/${id}/retry`, {
        method: "POST"
      });
      
      if (response.ok) {
        success("Requeued document processing");
        fetchDocuments(true);
      } else {
        error("Failed to requeue document");
        fetchDocuments(true);
      }
    } catch (err) {
      console.error("Retry error:", err);
      error("Failed to requeue document");
      fetchDocuments(true);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RAG Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">Upload and catalog context sources for autonomous agent indexing.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Document Uploader Card (Left, cols-1) */}
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-card/40 border-border/80 h-full flex flex-col">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Upload className="h-4.5 w-4.5 text-indigo-400" /> Catalog New Source
              </CardTitle>
              <CardDescription>Upload textual context to automatically generate OpenAI embeddings and pgvector storage.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center min-h-[250px]">
              
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange}
                accept=".pdf,.txt,.docx"
                className="hidden" 
              />

              {/* IDLE & DRAGGING */}
              {(uploadState === "idle" || uploadState === "dragging") && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={triggerBrowse}
                  className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                    uploadState === "dragging"
                      ? "border-blue-500 bg-blue-500/5 dark:bg-blue-950/20 text-blue-400"
                      : "border-muted-foreground/30 hover:border-indigo-500/50 hover:bg-indigo-500/5 dark:hover:bg-indigo-950/10"
                  }`}
                >
                  <Upload className={`h-10 w-10 mb-4 transition-transform ${uploadState === "dragging" ? "scale-110 text-blue-400 animate-bounce" : "text-indigo-400"}`} />
                  <span className="text-xs font-semibold text-foreground">
                    {uploadState === "dragging" ? "Drop files to upload" : "Drag and drop your file here"}
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-1">
                    or click to browse from files
                  </span>
                  <span className="text-[9px] text-indigo-400/80 font-mono mt-3 uppercase tracking-wider">
                    PDF, TXT, or DOCX (Max 10MB)
                  </span>
                </div>
              )}

              {/* UPLOADING */}
              {uploadState === "uploading" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <FileText className="h-10 w-10 text-indigo-400 mb-4 animate-pulse" />
                  <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                    Uploading {currentFile?.name}
                  </span>
                  <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden mt-4 max-w-[220px]">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-100 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-2 font-mono">{uploadProgress}%</span>
                </div>
              )}

              {/* PROCESSING */}
              {uploadState === "processing" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <RefreshCw className="h-10 w-10 text-indigo-400 animate-spin mb-4" />
                  <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                    {currentFile?.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-2 animate-pulse font-medium">
                    {activeStatus?.progress_message || "AI is reading your document..."}
                  </span>
                  <span className="text-[9px] text-indigo-400/80 font-mono mt-3 uppercase tracking-wider select-none">
                    Generating embeddings
                  </span>
                </div>
              )}

              {/* READY */}
              {uploadState === "ready" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-emerald-400 mb-4 animate-bounce" />
                  <span className="text-xs font-bold text-emerald-400 truncate max-w-[200px]">
                    Ready
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-1 font-semibold">
                    {readyChunks} chunks indexed
                  </span>
                  <span className="text-[10px] text-muted-foreground mt-3 truncate max-w-[200px] font-mono">
                    {currentFile?.name}
                  </span>
                </div>
              )}

              {/* FAILED */}
              {uploadState === "failed" && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                  <XCircle className="h-12 w-12 text-rose-500 mb-4 animate-bounce" />
                  <span className="text-xs font-bold text-rose-500">
                    Failed
                  </span>
                  <p className="text-[10px] text-rose-400 font-semibold mt-2 max-w-[200px] leading-relaxed">
                    {uploadError}
                  </p>
                  <Button
                    onClick={() => {
                      if (currentFile) {
                        processUpload(currentFile);
                      } else {
                        setUploadState("idle");
                      }
                    }}
                    variant="outline"
                    size="sm"
                    className="mt-4 border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 text-xs shadow-sm flex items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry Ingestion
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        </div>

        {/* Documents Card Grid (Right, cols-2) */}
        <div className="md:col-span-2">
          <Card className="bg-card/40 border-border/80 h-full flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Indexed Sources</CardTitle>
                <CardDescription>Overview of documentation segments searchable by the query pipeline.</CardDescription>
              </div>
              <Button
                onClick={() => fetchDocuments()}
                variant="outline"
                size="sm"
                className="h-8 text-xs flex items-center gap-1.5 border-border bg-muted/10"
                disabled={isLoadingDocs}
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingDocs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col">
              
              {isLoadingDocs ? (
                <div className="flex-1 flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-xs select-none">Loading indexed catalog...</span>
                </div>
              ) : documents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center h-64 text-muted-foreground select-none">
                  <BookOpen className="h-8 w-8 text-muted-foreground/50 mb-3" />
                  <span className="text-xs font-medium">No sources indexed yet.</span>
                  <p className="text-[10px] text-muted-foreground max-w-xs text-center mt-1">
                    Upload documents to initialize vector embeddings mapping.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {documents.map((doc) => {
                    
                    // ── PROCESSING STATE CARD ──────────────────────────────
                    if (doc.status === "processing") {
                      return (
                        <div
                          key={doc.id}
                          className="border-2 border-indigo-500/40 bg-indigo-500/5 shadow-md shadow-indigo-500/5 rounded-2xl p-4 flex flex-col justify-between min-h-[140px] animate-pulse"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="h-5 w-5 text-indigo-400 shrink-0" />
                              <span className="font-bold text-sm text-foreground truncate" title={doc.file_name}>
                                {doc.file_name}
                              </span>
                            </div>
                            <span className="bg-muted text-muted-foreground font-semibold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 select-none">
                              Processing
                            </span>
                          </div>

                          <div className="mt-4 flex items-center gap-2 text-xs text-indigo-400/90 font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400 shrink-0" />
                            <span className="truncate">{doc.progress_message || "Queued..."}</span>
                          </div>
                        </div>
                      );
                    }

                    // ── FAILED STATE CARD ──────────────────────────────────
                    if (doc.status === "failed") {
                      return (
                        <div
                          key={doc.id}
                          className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 flex flex-col justify-between min-h-[140px]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FileText className="h-5 w-5 text-rose-400 shrink-0" />
                              <span className="font-bold text-sm text-foreground truncate" title={doc.file_name}>
                                {doc.file_name}
                              </span>
                            </div>
                            <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider shrink-0 select-none">
                              Failed
                            </span>
                          </div>

                          <div className="mt-3 text-[11px] text-rose-300/90 flex items-start gap-1 min-h-[24px]">
                            <AlertCircle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                            <p className="line-clamp-2 leading-relaxed" title={doc.error_message || "Vectorization failed."}>
                              {doc.error_message || "Ingestion error."}
                            </p>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-rose-500/10">
                            <Button
                              onClick={() => handleRetryDoc(doc.id)}
                              variant="outline"
                              size="sm"
                              className="h-8 border-rose-500/20 bg-rose-500/5 text-rose-400 hover:bg-rose-500/10 text-[10px] font-semibold gap-1"
                            >
                              <RefreshCw className="h-3 w-3" /> Retry
                            </Button>
                            
                            <button
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="text-muted-foreground hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                              title="Delete source"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    // ── READY STATE CARD ───────────────────────────────────
                    return (
                      <div
                        key={doc.id}
                        className="border border-emerald-500/25 bg-emerald-500/5 rounded-2xl p-4 flex flex-col justify-between min-h-[140px] shadow-sm shadow-emerald-500/5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText className="h-5 w-5 text-emerald-400 shrink-0" />
                            <span className="font-bold text-sm text-foreground truncate" title={doc.file_name}>
                              {doc.file_name}
                            </span>
                          </div>
                          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider flex items-center gap-1 shrink-0 select-none">
                            <CheckCircle2 className="h-3 w-3" /> Ready
                          </span>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground font-semibold">
                            {doc.chunk_count !== null ? `${doc.chunk_count} chunks indexed` : "0 chunks"}
                          </span>
                          
                          <button
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="text-muted-foreground hover:text-rose-500 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors border border-transparent hover:border-rose-500/10"
                            title="Delete source"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

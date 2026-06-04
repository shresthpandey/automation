"use client";

import * as React from "react";
import { BookOpen, Upload, FileText, CheckCircle2, RefreshCw, Eye } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";

const initialDocs = [
  { id: "d1", title: "Product_FAQ_v2.pdf", size: "242 KB", chunks: 14, status: "indexed", uploadedAt: "June 02, 2026" },
  { id: "d2", title: "Return_Policy_2026.docx", size: "128 KB", chunks: 6, status: "indexed", uploadedAt: "May 30, 2026" },
  { id: "d3", title: "API_Endpoints_Doc.md", size: "12 KB", chunks: 3, status: "indexing", uploadedAt: "Just now" }
];

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = React.useState(initialDocs);
  const [docTitle, setDocTitle] = React.useState("");
  const [docContent, setDocContent] = React.useState("");
  const [isUploading, setIsUploading] = React.useState(false);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle || !docContent) return;

    setIsUploading(true);

    // Simulate vector parsing embeddings
    setTimeout(() => {
      const newDoc = {
        id: `d-${Date.now()}`,
        title: docTitle.endsWith(".md") || docTitle.endsWith(".txt") ? docTitle : `${docTitle}.txt`,
        size: `${Math.round(docContent.length / 1024)} KB`,
        chunks: Math.ceil(docContent.length / 500),
        status: "indexed" as const,
        uploadedAt: "Just now"
      };
      setDocuments([newDoc, ...documents]);
      setDocTitle("");
      setDocContent("");
      setIsUploading(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RAG Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">Upload and catalog context sources for autonomous agent indexing.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        
        {/* Document Uploader Form (Left, cols-1) */}
        <div className="md:col-span-1 space-y-6">
          <Card className="bg-card/40 border-border/80">
            <CardHeader>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Upload className="h-4.5 w-4.5 text-indigo-400" /> Catalog New Source
              </CardTitle>
              <CardDescription>Upload textual context to automatically generate OpenAI embeddings and pgvector storage.</CardDescription>
            </CardHeader>
            <form onSubmit={handleUpload}>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Document Title</label>
                  <Input 
                    placeholder="e.g. Refund_Policy.txt" 
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Context Content</label>
                  <textarea 
                    placeholder="Paste raw text or documentation rules here..."
                    value={docContent}
                    onChange={e => setDocContent(e.target.value)}
                    required
                    rows={6}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Indexing vector nodes...
                    </>
                  ) : (
                    <>
                      Ingest & Segment <BookOpen className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </CardContent>
            </form>
          </Card>
        </div>

        {/* Catalog Table (Right, cols-2) */}
        <div className="md:col-span-2">
          <Card className="bg-card/40 border-border/80">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Indexed Sources</CardTitle>
              <CardDescription>Overview of documentation segments searchable by the query pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground text-xs uppercase tracking-wider font-semibold bg-muted/10">
                      <th className="px-6 py-3.5">Document File</th>
                      <th className="px-6 py-3.5">Size</th>
                      <th className="px-6 py-3.5">Chunks</th>
                      <th className="px-6 py-3.5">Index Status</th>
                      <th className="px-6 py-3.5">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground flex items-center gap-2">
                          <FileText className="h-4.5 w-4.5 text-indigo-400" />
                          {doc.title}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{doc.size}</td>
                        <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{doc.chunks} units</td>
                        <td className="px-6 py-4 text-xs font-semibold">
                          {doc.status === "indexed" ? (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> indexed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-amber-400 animate-pulse">
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> vectorising
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{doc.uploadedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

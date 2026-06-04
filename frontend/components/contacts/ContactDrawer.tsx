import * as React from "react";
import { useRouter } from "next/navigation";
import { X, MessageSquare, Plus, Trash2, Mail, Phone, Calendar, Save, Sparkles, MessageCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  lead_score: number;
  lead_status: string;
  created_at: string;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, number>;
}

interface ContactDrawerProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdateContact: (contactId: string, updates: Partial<Contact>) => Promise<void>;
}

export function ContactDrawer({ contact, onClose, onUpdateContact }: ContactDrawerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [isSavingNotes, setIsSavingNotes] = React.useState(false);
  const [tagInput, setTagInput] = React.useState("");
  const [tags, setTags] = React.useState<string[]>([]);
  const [history, setHistory] = React.useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(false);

  // Sync state on contact prop change
  React.useEffect(() => {
    if (contact) {
      setIsOpen(true);
      setNotes(contact.notes || "");
      setTags(contact.tags || []);
      fetchConversationHistory(contact.id);
    } else {
      setIsOpen(false);
    }
  }, [contact]);

  // Fetch past conversations for the contact
  const fetchConversationHistory = async (contactId: string) => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, last_message, last_message_at, created_at")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false });

      if (data) {
        setHistory(data);
      }
    } catch (e) {
      console.error("Failed to load conversation history:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  if (!contact) return null;

  // Handle auto-saving notes on blur
  const handleNotesBlur = async () => {
    if (notes === (contact.notes || "")) return;
    setIsSavingNotes(true);
    try {
      await onUpdateContact(contact.id, { notes });
    } catch (e) {
      console.error("Failed to auto-save notes:", e);
    } finally {
      setIsSavingNotes(false);
    }
  };

  // Add a tag on Enter or button click
  const handleAddTag = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTag = tagInput.trim().toLowerCase();
    if (!cleanTag || tags.includes(cleanTag)) return;

    const newTags = [...tags, cleanTag];
    setTags(newTags);
    setTagInput("");
    await onUpdateContact(contact.id, { tags: newTags });
  };

  // Delete a tag
  const handleDeleteTag = async (tagToDelete: string) => {
    const newTags = tags.filter((t) => t !== tagToDelete);
    setTags(newTags);
    await onUpdateContact(contact.id, { tags: newTags });
  };

  // Navigate to conversation thread in Inbox
  const handleOpenConversation = (conversationId: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("converseos_active_conv_id", conversationId);
    }
    router.push("/inbox");
  };

  // Get first conversation ID or open new if none
  const handleOpenActiveInbox = () => {
    if (history.length > 0) {
      handleOpenConversation(history[0].id);
    } else {
      router.push("/inbox");
    }
  };

  // Helper to format date
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  };

  // Score breakdown styling map
  const statusLower = (contact.lead_status || "cold").toLowerCase();
  let scoreColor = "text-zinc-400 border-zinc-500/20 bg-zinc-500/10";
  let statusText = "Cold Lead";
  if (statusLower === "hot") {
    scoreColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10 shadow-emerald-500/10 shadow-md";
    statusText = "Hot Lead";
  } else if (statusLower === "warm") {
    scoreColor = "text-amber-400 border-amber-500/30 bg-amber-500/10 shadow-amber-500/5 shadow-md";
    statusText = "Warm Lead";
  }

  // Get initials
  const initials = contact.name
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop overlay */}
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div
          className={`w-screen max-w-md transform bg-card/90 backdrop-blur-xl border-l border-border/80 text-card-foreground shadow-2xl transition-transform duration-300 ease-in-out ${
            isOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-border/40 bg-muted/20">
            <h2 className="text-lg font-bold tracking-tight text-foreground select-none">Customer Profile</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg border border-border bg-card/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Drawer Content Body (Scrollable) */}
          <div className="h-[calc(100vh-140px)] overflow-y-auto px-6 py-6 space-y-6">
            
            {/* Identity & Core Info */}
            <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-border/30">
              <div className={`h-20 w-20 rounded-full flex items-center justify-center text-xl font-bold border-2 ring-8 ring-offset-background ring-offset-2 ${
                statusLower === "hot" ? "border-emerald-500 ring-emerald-500/20 text-emerald-400" :
                statusLower === "warm" ? "border-amber-500 ring-amber-500/20 text-amber-400" :
                "border-zinc-500 ring-zinc-500/10 text-zinc-300"
              }`}>
                {initials}
              </div>
              <div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">{contact.name}</h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider mt-1 select-none">
                  {contact.source || "whatsapp"}
                </span>
              </div>
              <div className="w-full grid grid-cols-2 gap-3 text-xs text-left pt-3">
                <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/10 p-2 rounded-lg border border-border/20">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="font-mono">{contact.phone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground bg-muted/10 p-2 rounded-lg border border-border/20 truncate">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                  <span className="truncate" title={contact.email}>{contact.email || "No Email"}</span>
                </div>
              </div>
            </div>

            {/* Lead Scoring Panel */}
            <div className="space-y-3">
              <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider select-none">AI Lead Intelligence</h4>
              <div className={`p-4 rounded-xl border flex items-center justify-between ${scoreColor}`}>
                <div>
                  <div className="text-2xl font-black font-mono">{contact.lead_score || 0} / 100</div>
                  <div className="text-xs font-bold uppercase tracking-wider mt-0.5">{statusText}</div>
                </div>
                <Sparkles className="h-6 w-6 opacity-80" />
              </div>

              {/* Score breakdown logs */}
              {contact.metadata && Object.keys(contact.metadata).length > 0 && (
                <div className="bg-muted/10 border border-border/20 rounded-lg p-3 space-y-1.5">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider select-none">Score Breakdown</div>
                  <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
                    {Object.entries(contact.metadata).map(([kw, delta]) => (
                      <div key={kw} className="flex justify-between items-center bg-card/45 px-2 py-1 rounded border border-border/10">
                        <span className="text-muted-foreground truncate mr-2">"{kw}"</span>
                        <span className={`font-bold ${delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          +{delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notes Section (Auto-saves on blur) */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider select-none">CRM Notes</h4>
                {isSavingNotes ? (
                  <span className="text-[10px] text-muted-foreground animate-pulse">Auto-saving...</span>
                ) : (
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <Save className="h-3 w-3" /> Saved
                  </span>
                )}
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Write logs, customer preferences, or deal parameters... (Auto-saves on leave)"
                rows={4}
                className="w-full bg-muted/20 border border-border/80 rounded-xl p-3 text-xs leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/80 transition-colors resize-none overflow-y-auto"
              />
            </div>

            {/* Tags Board */}
            <div className="space-y-2">
              <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider select-none">Contact Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-muted/40 text-foreground border border-border/50 shadow-sm"
                  >
                    <span>{tag}</span>
                    <button
                      onClick={() => handleDeleteTag(tag)}
                      className="hover:text-rose-400 transition-colors p-0.5"
                      type="button"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                {tags.length === 0 && (
                  <span className="text-xs italic text-muted-foreground/60 py-0.5 select-none">No tags cataloged.</span>
                )}
              </div>
              
              {/* Tag Add Inline Form */}
              <form onSubmit={handleAddTag} className="flex gap-2 items-center mt-2">
                <input
                  type="text"
                  placeholder="Add tag (e.g. prospect)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="flex-1 bg-muted/30 border border-border/80 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-primary/80"
                />
                <button
                  type="submit"
                  disabled={!tagInput.trim()}
                  className="p-1.5 bg-primary text-white hover:opacity-90 rounded-lg disabled:opacity-50 text-xs shrink-0 flex items-center justify-center"
                >
                  <Plus className="h-4.5 w-4.5" />
                </button>
              </form>
            </div>

            {/* Conversation History */}
            <div className="space-y-2.5">
              <h4 className="text-xs uppercase font-bold text-muted-foreground tracking-wider select-none">Past Conversations</h4>
              
              {isLoadingHistory ? (
                <div className="text-center text-xs text-muted-foreground py-4 animate-pulse">Loading logs...</div>
              ) : history.length > 0 ? (
                <div className="space-y-2">
                  {history.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleOpenConversation(conv.id)}
                      className="border border-border/40 hover:border-primary/40 bg-muted/5 hover:bg-muted/20 rounded-xl p-3 cursor-pointer transition-all duration-200 space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                          conv.status === "open" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                          "bg-zinc-500/10 text-zinc-400 border border-zinc-500/25"
                        }`}>
                          {conv.status}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/80">
                          {formatDate(conv.last_message_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {conv.last_message || <span className="italic opacity-60">No messages in thread</span>}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs italic text-muted-foreground/60 py-2 select-none">
                  No active or past conversation logs in database.
                </div>
              )}
            </div>

          </div>

          {/* Quick Actions Footer Sticky */}
          <div className="absolute bottom-0 inset-x-0 bg-muted/20 border-t border-border/50 px-6 py-4 flex gap-3">
            <button
              onClick={handleOpenActiveInbox}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-xs py-2.5 rounded-xl hover:opacity-95 shadow-md flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="h-4.5 w-4.5" />
              <span>Open in Inbox</span>
            </button>
            <button
              onClick={() => {
                // Focus notes textarea
                const el = document.querySelector("textarea");
                if (el) el.focus();
              }}
              className="px-4 border border-border bg-card hover:bg-muted font-medium text-xs rounded-xl transition-colors"
            >
              Add Note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

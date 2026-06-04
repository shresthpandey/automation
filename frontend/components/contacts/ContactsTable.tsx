import * as React from "react";
import { MessageSquare, Eye, Phone, Mail, Calendar } from "lucide-react";
import { LeadScoreBadge } from "./LeadScoreBadge";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source?: string;
  lead_score: number;
  lead_status: string;
  created_at: string;
  conversations?: { count: number }[];
  conversations_count?: number;
}

interface ContactsTableProps {
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  searchQuery: string;
  statusFilter: string;
  sortBy: string;
}

export function ContactsTable({
  contacts,
  onSelectContact,
  searchQuery,
  statusFilter,
  sortBy
}: ContactsTableProps) {

  // Helper to get initials
  const getInitials = (name: string) => {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name[0].toUpperCase();
  };

  // Helper to format relative time
  const getRelativeTime = (dateStr: string) => {
    if (!dateStr) return "Never";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch (e) {
      return "N/A";
    }
  };

  // Filter contacts client-side
  const filteredContacts = React.useMemo(() => {
    return contacts
      .filter((contact) => {
        // 1. Search Query
        const term = searchQuery.toLowerCase();
        const nameMatch = contact.name.toLowerCase().includes(term);
        const phoneMatch = (contact.phone || "").includes(term);
        const emailMatch = (contact.email || "").toLowerCase().includes(term);
        const searchMatches = nameMatch || phoneMatch || emailMatch;

        // 2. Status Filter
        let statusMatches = true;
        if (statusFilter !== "all") {
          statusMatches = (contact.lead_status || "cold").toLowerCase() === statusFilter.toLowerCase();
        }

        return searchMatches && statusMatches;
      })
      .sort((a, b) => {
        // 3. Sorting
        if (sortBy === "score") {
          return (b.lead_score || 0) - (a.lead_score || 0);
        }
        if (sortBy === "name") {
          return a.name.localeCompare(b.name);
        }
        // Default 'latest' (created_at desc)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [contacts, searchQuery, statusFilter, sortBy]);

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase tracking-wider font-bold bg-muted/5 select-none">
            <th className="px-6 py-4">Customer</th>
            <th className="px-6 py-4">Source</th>
            <th className="px-6 py-4 text-center">Lead Status</th>
            <th className="px-6 py-4 text-center">Conversations</th>
            <th className="px-6 py-4">Last Active</th>
            <th className="px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/25">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => {
              const convCount = contact.conversations_count ?? (contact.conversations?.[0]?.count || 0);
              
              // Avatar glow color class mapping
              const statusLower = (contact.lead_status || "cold").toLowerCase();
              let borderGlow = "ring-zinc-500/20 bg-zinc-500/10 text-zinc-300";
              if (statusLower === "hot") {
                borderGlow = "ring-emerald-500/30 bg-emerald-500/10 text-emerald-400 ring-2";
              } else if (statusLower === "warm") {
                borderGlow = "ring-amber-500/30 bg-amber-500/10 text-amber-400 ring-2";
              }

              return (
                <tr
                  key={contact.id}
                  onClick={() => onSelectContact(contact)}
                  className="hover:bg-muted/10 transition-all duration-200 cursor-pointer group"
                >
                  {/* Name + Phone stacked with Avatar */}
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-105 duration-200 ${borderGlow}`}>
                      {getInitials(contact.name)}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">
                        {contact.name}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{contact.phone}</span>
                      </div>
                    </div>
                  </td>

                  {/* Channel/Source badge */}
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 capitalize">
                      {contact.source || "whatsapp"}
                    </span>
                  </td>

                  {/* Lead Score Badge */}
                  <td className="px-6 py-4 text-center">
                    <LeadScoreBadge score={contact.lead_score || 0} status={contact.lead_status} />
                  </td>

                  {/* Total conversations */}
                  <td className="px-6 py-4 text-center font-mono font-bold text-xs">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-muted/30 text-foreground border border-border/30 gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      {convCount}
                    </span>
                  </td>

                  {/* Last active relative time */}
                  <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                      {getRelativeTime(contact.created_at)}
                    </span>
                  </td>

                  {/* View Details CTA */}
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectContact(contact);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground shadow-sm transition-all duration-200"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>View</span>
                    </button>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={6} className="px-6 py-16 text-center text-muted-foreground select-none">
                <div className="text-sm italic">No contacts match your query.</div>
                <div className="text-xs text-muted-foreground/60 mt-1">Try resetting the filter values or searching a different term.</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

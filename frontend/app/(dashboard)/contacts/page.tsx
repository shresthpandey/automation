"use client";

import * as React from "react";
import { Plus, Search, UserPlus, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../components/ui/card";
import { supabase } from "../../../lib/supabase";
import { ContactsTable } from "../../../components/contacts/ContactsTable";
import { ContactDrawer } from "../../../components/contacts/ContactDrawer";

export default function ContactsPage() {
  const [contacts, setContacts] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedContact, setSelectedContact] = React.useState<any | null>(null);

  // Filters & Sorting States
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("latest");

  // Add Contact Form States
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newPhone, setNewPhone] = React.useState("");
  const [newEmail, setNewEmail] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      // 1. Resolve organization ID (from cache or profiles DB lookup)
      let targetOrgId = typeof window !== "undefined" ? localStorage.getItem("converseos_org_id") || "" : "";
      
      if (!targetOrgId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("org_id")
            .eq("id", user.id)
            .single();
            
          if (profile?.org_id) {
            targetOrgId = profile.org_id;
            if (typeof window !== "undefined") {
              localStorage.setItem("converseos_org_id", targetOrgId);
            }
          }
        }
      }

      if (!targetOrgId) {
        setIsLoading(false);
        return;
      }

      // 2. Fetch contacts joined with conversations count
      const { data, error } = await supabase
        .from("contacts")
        .select("*, conversations(count)")
        .eq("org_id", targetOrgId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) {
        setContacts(data);
      }
    } catch (e) {
      console.error("Failed to load contacts:", e);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchContacts();
  }, []);

  // Handle adding a contact manually
  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim() || isAdding) return;
    setIsAdding(true);

    try {
      let targetOrgId = typeof window !== "undefined" ? localStorage.getItem("converseos_org_id") || "" : "";
      if (!targetOrgId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
          if (profile) targetOrgId = profile.org_id;
        }
      }

      if (!targetOrgId) {
        alert("No active organization found. Please sign in again.");
        return;
      }

      const { data, error } = await supabase
        .from("contacts")
        .insert({
          org_id: targetOrgId,
          name: newName,
          phone: newPhone,
          email: newEmail || null,
          source: "manual",
          lead_score: 0,
          lead_status: "cold",
          tags: [],
          metadata: {}
        })
        .select("*, conversations(count)")
        .single();

      if (error) throw error;
      
      if (data) {
        setContacts([data, ...contacts]);
        setNewName("");
        setNewPhone("");
        setNewEmail("");
        setShowAddForm(false);
      }
    } catch (e: any) {
      alert(`Error creating contact: ${e.message || "Unknown error"}`);
    } finally {
      setIsAdding(false);
    }
  };

  // Callback to update contact fields (like tags/notes) and save to Supabase
  const handleUpdateContact = async (contactId: string, updates: any) => {
    // 1. Optimistic UI update
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, ...updates } : c))
    );
    
    // Sync Drawer selected contact state if it's currently open
    if (selectedContact && selectedContact.id === contactId) {
      setSelectedContact((prev: any) => ({ ...prev, ...updates }));
    }

    try {
      // 2. Perform DB update
      const { error } = await supabase
        .from("contacts")
        .update(updates)
        .eq("id", contactId);

      if (error) throw error;
    } catch (e) {
      console.error("Failed to sync contact updates with Supabase:", e);
      // Revert/refresh on error
      fetchContacts();
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Overview header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            Contacts 
            <span className="text-xs bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 rounded-full select-none">
              {isLoading ? "..." : contacts.length} Total
            </span>
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Manage your customer database, inspect lead score updates, and open active chats.
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-center">
          <Button
            onClick={fetchContacts}
            variant="outline"
            size="icon"
            disabled={isLoading}
            className="h-9 w-9 border-border/80 bg-card"
          >
            <RefreshCw className={`h-4 w-4 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-primary hover:opacity-90 font-medium shadow-md flex items-center gap-1.5 h-9"
          >
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Add Contact form component */}
      {showAddForm && (
        <Card className="border-indigo-500/20 bg-indigo-950/10 backdrop-blur-md glow-indigo">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-foreground select-none">
              <UserPlus className="h-4.5 w-4.5 text-indigo-400" /> New Contact Profile
            </CardTitle>
            <CardDescription className="text-xs">
              Enter details below to manually catalog a customer profile.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleAddContact}>
            <CardContent className="grid sm:grid-cols-3 gap-4 pb-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Full Name *</label>
                <Input placeholder="John Doe" value={newName} onChange={e => setNewName(e.target.value)} required disabled={isAdding} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">WhatsApp/Phone Number *</label>
                <Input placeholder="+1 555-123-4567" value={newPhone} onChange={e => setNewPhone(e.target.value)} required disabled={isAdding} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Email Address</label>
                <Input placeholder="john@example.com" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} disabled={isAdding} />
              </div>
            </CardContent>
            <div className="p-6 pt-0 flex gap-2 justify-end">
              <Button type="button" variant="ghost" className="text-xs" onClick={() => setShowAddForm(false)}>Cancel</Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold" disabled={isAdding}>
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save profile"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Main Table Container Card */}
      <Card className="bg-card/25 border-border/60 backdrop-blur-md shadow-xl glow-indigo">
        <CardHeader className="pb-4 border-b border-border/30">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Search Input */}
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="Search by name, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-muted/20 border-border/80 focus-visible:ring-1 focus-visible:ring-primary h-9 text-xs"
              />
            </div>

            {/* Filter Tabs & Sort Selector */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Filter pills */}
              <div className="flex bg-muted/30 border border-border/50 rounded-lg p-0.5 select-none">
                {["all", "hot", "warm", "cold"].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setStatusFilter(tab)}
                    className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      statusFilter === tab
                        ? "bg-primary text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-muted/30 border border-border/80 rounded-lg h-9 px-3 text-xs font-medium text-foreground cursor-pointer focus:outline-none select-none"
              >
                <option value="latest">Sort: Latest</option>
                <option value="score">Sort: Lead Score</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground select-none">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <span className="text-xs">Loading customer directory...</span>
            </div>
          ) : (
            <ContactsTable
              contacts={contacts}
              onSelectContact={setSelectedContact}
              searchQuery={search}
              statusFilter={statusFilter}
              sortBy={sortBy}
            />
          )}
        </CardContent>
      </Card>

      {/* CRM Details Slide-in Drawer */}
      <ContactDrawer
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onUpdateContact={handleUpdateContact}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { 
  Building2, 
  Smartphone, 
  Users, 
  CreditCard, 
  Save, 
  Check, 
  Loader2, 
  UserPlus, 
  Trash2,
  AlertCircle
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { supabase } from "../../../lib/supabase";

type ActiveTab = "org" | "whatsapp" | "team" | "billing";

interface ProfileItem {
  id: string;
  full_name: string;
  role: "admin" | "agent";
  avatar_url?: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("org");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaved, setIsSaved] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  const [orgId, setOrgId] = React.useState("");

  // Tab 1: Organization States
  const [orgName, setOrgName] = React.useState("");
  const [industry, setIndustry] = React.useState("Ecommerce");
  const [plan, setPlan] = React.useState("free");

  // Tab 2: WhatsApp States
  const [phoneId, setPhoneId] = React.useState("");
  const [token, setToken] = React.useState("");
  const [webhookUrl, setWebhookUrl] = React.useState("https://api.converseos.com/api/webhooks/whatsapp");
  const [verifyToken, setVerifyToken] = React.useState("");

  // Tab 3: Team States
  const [teamMembers, setTeamMembers] = React.useState<ProfileItem[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<"admin" | "agent">("agent");
  const [inviting, setInviting] = React.useState(false);

  React.useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        // Resolve Org ID
        let resolvedOrgId = localStorage.getItem("converseos_org_id") || "";
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user && !resolvedOrgId) {
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
          if (profile?.org_id) {
            resolvedOrgId = profile.org_id;
            localStorage.setItem("converseos_org_id", resolvedOrgId);
          }
        }
        
        if (!resolvedOrgId) return;
        setOrgId(resolvedOrgId);

        // 1. Fetch organization details
        const { data: orgData } = await supabase.from("organizations").select("*").eq("id", resolvedOrgId).single();
        if (orgData) {
          setOrgName(orgData.name || "");
          setPlan(orgData.plan || "free");
          setPhoneId(orgData.whatsapp_phone_number_id || "");
          setToken(orgData.whatsapp_token || "");
          setVerifyToken(orgData.whatsapp_verify_token || "converseos_verify_token_2026");
          if (orgData.settings) {
            setIndustry(orgData.settings.industry || "Ecommerce");
          }
        }

        // 2. Fetch team members profile list
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, role, avatar_url").eq("org_id", resolvedOrgId);
        if (profiles) {
          setTeamMembers(profiles as ProfileItem[]);
        }

        // Auto compile webhook URL for metadata visual display
        if (typeof window !== "undefined") {
          const host = window.location.host;
          const protocol = window.location.protocol;
          setWebhookUrl(`${protocol}//${host}/api/webhooks/whatsapp`);
        }

      } catch (e: any) {
        console.error("Failed to load settings configuration: ", e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // Save Settings Form Submissions
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !orgId) return;

    setIsLoading(true);
    setIsSaved(false);
    setErrorMsg("");

    try {
      if (activeTab === "org") {
        const { error } = await supabase.from("organizations").update({
          name: orgName,
          settings: { industry }
        }).eq("id", orgId);
        if (error) throw error;
      } 
      else if (activeTab === "whatsapp") {
        const { error } = await supabase.from("organizations").update({
          whatsapp_phone_number_id: phoneId,
          whatsapp_token: token,
          whatsapp_verify_token: verifyToken
        }).eq("id", orgId);
        if (error) throw error;
      }

      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to update configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  // Invite Team Members
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || inviting || !orgId) return;
    setInviting(true);
    
    try {
      // Simulate inviting user (inserts fallback mock agent profile)
      const mockId = crypto.randomUUID();
      const newMember: ProfileItem = {
        id: mockId,
        full_name: inviteEmail.split("@")[0],
        role: inviteRole
      };

      const { error } = await supabase.from("profiles").insert({
        id: mockId,
        org_id: orgId,
        full_name: newMember.full_name,
        role: inviteRole
      });

      if (error) throw error;

      setTeamMembers([...teamMembers, newMember]);
      setInviteEmail("");
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to insert team profile.");
    } finally {
      setInviting(false);
    }
  };

  // Delete Member
  const handleDeleteMember = async (memberId: string) => {
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", memberId);
      if (error) throw error;
      setTeamMembers(teamMembers.filter(m => m.id !== memberId));
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to delete profile.");
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workspace Configuration</h1>
        <p className="text-sm text-muted-foreground">Manage credentials, external messaging integrations, team access policies and billing plans.</p>
      </div>

      {/* Tabs Menu list */}
      <div className="flex gap-2 border-b border-border pb-px select-none text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <button
          onClick={() => setActiveTab("org")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "org" ? "border-primary text-primary" : "border-transparent hover:text-foreground"
          }`}
        >
          <Building2 className="h-4 w-4" /> Organization Details
        </button>
        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "whatsapp" ? "border-primary text-primary" : "border-transparent hover:text-foreground"
          }`}
        >
          <Smartphone className="h-4 w-4" /> WhatsApp Channels
        </button>
        <button
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "team" ? "border-primary text-primary" : "border-transparent hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" /> Team Accounts
        </button>
        <button
          onClick={() => setActiveTab("billing")}
          className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-all ${
            activeTab === "billing" ? "border-primary text-primary" : "border-transparent hover:text-foreground"
          }`}
        >
          <CreditCard className="h-4 w-4" /> Plans & Billing
        </button>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive-foreground">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: ORGANIZATION DETAILS */}
      {activeTab === "org" && (
        <form onSubmit={handleSave} className="space-y-6">
          <Card className="bg-card/40 border-border/80 glow-indigo">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Business settings</CardTitle>
              <CardDescription>Setup administrative parameters for customer dashboards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Business Name</label>
                <Input 
                  value={orgName} 
                  onChange={e => setOrgName(e.target.value)} 
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Industry</label>
                <select
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  className="w-full bg-background border border-input rounded-md h-9 px-3 text-sm focus-visible:outline-none focus:border-primary/80 transition-colors font-medium text-foreground cursor-pointer"
                >
                  <option value="Coaching">Coaching & Training</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Ecommerce">Ecommerce</option>
                  <option value="Agency">Digital Agency</option>
                  <option value="Other">Other / Miscellaneous</option>
                </select>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-end select-none">
            <Button type="submit" disabled={isLoading} className="bg-primary text-white font-medium hover:opacity-90 flex items-center gap-1.5 shadow-md">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </form>
      )}

      {/* TAB 2: WHATSAPP CONFIG */}
      {activeTab === "whatsapp" && (
        <form onSubmit={handleSave} className="space-y-6">
          <Card className="bg-card/40 border-border/80 glow-indigo">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Meta developer keys</CardTitle>
              <CardDescription>Configure credentials to query API calls and dispatch WhatsApp texts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phone Number ID</label>
                  <Input value={phoneId} onChange={e => setPhoneId(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Verify Token</label>
                  <Input value={verifyToken} onChange={e => setVerifyToken(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Access Token</label>
                <Input type="password" value={token} onChange={e => setToken(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Meta Callback Webhook URL (Display Only)</label>
                <Input value={webhookUrl} readOnly className="bg-muted/30 font-mono text-xs text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground block">
                  Copy and configure this webhook target within your Meta Developer app dashboard.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end select-none">
            <Button type="submit" disabled={isLoading} className="bg-primary text-white font-medium hover:opacity-90 flex items-center gap-1.5 shadow-md">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : isSaved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              Save changes
            </Button>
          </div>
        </form>
      )}

      {/* TAB 3: TEAM ACCOUNTS */}
      {activeTab === "team" && (
        <div className="space-y-6">
          <Card className="bg-card/40 border-border/80 glow-indigo">
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Invite Team Members</CardTitle>
              <CardDescription>Give agents access to view and reply to customer threads.</CardDescription>
            </CardHeader>
            <form onSubmit={handleInviteUser}>
              <CardContent className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">User Email</label>
                  <Input 
                    type="email" 
                    placeholder="agent@company.com" 
                    value={inviteEmail} 
                    onChange={e => setInviteEmail(e.target.value)} 
                    required 
                  />
                </div>
                <div className="w-40 space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Access Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as any)}
                    className="w-full bg-background border border-input rounded-md h-9 px-3 text-sm focus-visible:outline-none focus:border-primary/80 transition-colors font-medium text-foreground cursor-pointer"
                  >
                    <option value="agent">Agent</option>
                    <option value="admin">Administrator</option>
                  </select>
                </div>
                <Button type="submit" disabled={inviting} className="bg-primary text-white hover:opacity-95 shadow-sm">
                  {inviting ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <UserPlus className="h-4.5 w-4.5" />}
                </Button>
              </CardContent>
            </form>
          </Card>

          {/* Members Table */}
          <Card className="bg-card/40 border-border/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Authorized Members</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground text-xs uppercase tracking-wider font-semibold bg-muted/10">
                      <th className="px-6 py-3.5">Name</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {teamMembers.map(member => (
                      <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-6 py-4 font-semibold text-foreground flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center text-xs uppercase font-bold">
                            {member.full_name[0]}
                          </div>
                          {member.full_name}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] uppercase font-bold tracking-wider rounded-full px-2 py-0.5 border ${
                            member.role === "admin" 
                              ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" 
                              : "bg-muted border-border text-muted-foreground"
                          }`}>
                            {member.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleDeleteMember(member.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: BILLING & PLANS */}
      {activeTab === "billing" && (
        <Card className="bg-card/45 border-border/80 glow-indigo text-center py-12 px-6">
          <CardHeader className="space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 border border-indigo-500/25 text-indigo-400 shadow-inner">
              <CreditCard className="h-6 w-6" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">Current Plan: {plan.toUpperCase()}</CardTitle>
            <CardDescription className="max-w-md mx-auto leading-relaxed text-sm">
              Upgrade your plan to unlock infinite active contacts syncing, multi-tenant agent invites, custom models parameters configurations, and dedicated API webhook triggers.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center select-none pt-4">
            <Button className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:opacity-95 shadow-md">
              Upgrade to Growth Plan ($49/mo)
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}

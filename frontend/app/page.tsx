import Link from "next/link";
import { 
  ArrowRight, 
  MessageSquare, 
  Users, 
  Zap, 
  TrendingUp, 
  Clock, 
  Globe 
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function OverviewPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-950/40 via-background to-background px-6 py-8 md:px-12 md:py-16">
      
      {/* Decorative Glow Background */}
      <div className="absolute top-0 right-1/4 -z-10 h-96 w-96 rounded-full bg-indigo-500/10 blur-[128px]" />
      <div className="absolute bottom-10 left-10 -z-10 h-72 w-72 rounded-full bg-purple-500/5 blur-[96px]" />

      {/* Header / Brand Nav */}
      <header className="mx-auto max-w-6xl flex items-center justify-between mb-12 md:mb-20">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold text-base shadow-lg shadow-indigo-500/20">
            C
          </div>
          <span className="font-bold tracking-tight text-lg">ConverseOS</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Sign In
          </Link>
          <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:opacity-90">
            <Link href="/register">Start Free</Link>
          </Button>
        </div>
      </header>

      {/* Hero / Main Section */}
      <main className="mx-auto max-w-6xl">
        <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-3 py-1 text-xs font-medium text-indigo-400">
              <Zap className="h-3 w-3 fill-current" /> Next-Gen Omnichannel Workspace
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground to-muted-foreground">
              Conversations, Structured by AI.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              Consolidate your WhatsApp messages, live chat, and CRM contacts in a single command center. Augment workflows with active AI RAG copilots.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Button size="lg" className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/15">
                <Link href="/inbox">
                  Enter Workspace
                </Link>
              </Button>
              <Button size="lg" variant="outline">
                <Link href="/settings">Connect Integrations</Link>
              </Button>
            </div>
          </div>

          {/* Premium Preview Glass Card */}
          <div className="relative group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 opacity-25 blur transition duration-1000 group-hover:opacity-35" />
            <Card className="relative border-border bg-card/45 backdrop-blur-xl overflow-hidden shadow-2xl hover-scale glow-purple">
              <CardHeader className="border-b border-border/40 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-destructive/60" />
                    <span className="h-3 w-3 rounded-full bg-amber-500/60" />
                    <span className="h-3 w-3 rounded-full bg-emerald-500/60" />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono tracking-widest">LIVE WORKSPACE</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {/* Simulated message row 1 */}
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-xs font-semibold text-indigo-300">WA</div>
                  <div className="rounded-2xl rounded-tl-none bg-muted px-4 py-2 text-sm text-foreground max-w-[70%]">
                    Hello! Can your AI engine lookup the pricing plan details for the Team package?
                  </div>
                </div>
                {/* Simulated message row 2 */}
                <div className="flex gap-3 justify-end">
                  <div className="rounded-2xl rounded-tr-none bg-primary/20 border border-primary/20 px-4 py-2 text-sm text-foreground max-w-[70%]">
                    <div className="flex items-center gap-1.5 mb-1 text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">
                      <Zap className="h-2.5 w-2.5 fill-current" /> ConverseOS Copilot
                    </div>
                    Sure! Based on the uploaded Team Knowledge Base, the Team Plan starts at $49/mo, including 5,000 active contacts.
                  </div>
                  <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-semibold text-purple-300">AI</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Analytics Section */}
        <section className="grid sm:grid-cols-3 gap-6 pt-8 border-t border-border/40">
          <Card className="bg-card/30 border-border/50 hover-scale glow-indigo">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Chats</CardTitle>
              <MessageSquare className="h-4 w-4 text-indigo-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">142</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> +12% increase from yesterday
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-card/30 border-border/50 hover-scale glow-purple">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">RAG Knowledge Articles</CardTitle>
              <Globe className="h-4 w-4 text-purple-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,824</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" /> Embedding sync: 2m ago
              </p>
            </CardContent>
          </Card>

          <Card className="bg-card/30 border-border/50 hover-scale glow-indigo">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">AI Automation Rate</CardTitle>
              <Users className="h-4 w-4 text-pink-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">84.6%</div>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium text-emerald-400">
                Saving ~14 hours/agent/week
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

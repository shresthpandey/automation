"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../components/ui/card";
import { supabase } from "../../../lib/supabase";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password || isLoading) return;

    setIsLoading(true);
    setErrorMsg("");

    try {
      // 1. Call FastAPI POST /api/auth/register
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const registerResponse = await fetch(`${apiUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          org_name: `${fullName}'s Workspace`
        })
      });

      if (!registerResponse.ok) {
        const errData = await registerResponse.json().catch(() => ({ detail: "Registration failed." }));
        throw new Error(errData.detail || "Registration failed.");
      }

      const registerData = await registerResponse.json();
      const orgId = registerData.org_id;

      // 2. Perform Supabase Sign In (since account is pre-confirmed on backend)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        loggerError("Sign in failed after auto-provision: ", signInError.message);
        router.push("/login");
        return;
      }

      // Store org_id locally in session state
      if (orgId && typeof window !== "undefined") {
        localStorage.setItem("converseos_org_id", orgId);
      }

      // Redirect to Onboarding Wizard page
      router.push("/onboarding");
    } catch (e: any) {
      setErrorMsg(e.message || "An unexpected error occurred during signup.");
      setIsLoading(false);
    }
  };


  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_bottom_left,_var(--var-gradient-stops))] from-indigo-950/30 via-background to-background px-4 py-12">
      
      {/* Background neon glows */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-purple-500/5 blur-[120px]" />

      <Card className="w-full max-w-md border-border/60 bg-card/45 backdrop-blur-xl shadow-2xl hover-scale glow-purple">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20">
            <MessageSquare className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Create workspace</CardTitle>
          <CardDescription>
            Register your admin credentials to start automating conversations
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive-foreground">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Full Name</label>
              <Input
                type="text"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isLoading}
                className="bg-background/40"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Email Address</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="bg-background/40"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="bg-background/40"
              />
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:opacity-95 shadow-md flex items-center justify-center gap-1.5"
            >
              {isLoading ? (
                <>
                  Provisioning workspace... <Loader2 className="h-4 w-4 animate-spin" />
                </>
              ) : (
                <>
                  Create Account <CheckCircle className="h-4 w-4" />
                </>
              )}
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              Already have a workspace?{" "}
              <Link href="/login" className="text-primary hover:underline font-bold">
                Sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// Error logger
function loggerError(msg: string, arg?: any) {
  console.error(`[SignUpAutoOrg] ${msg}`, arg);
}

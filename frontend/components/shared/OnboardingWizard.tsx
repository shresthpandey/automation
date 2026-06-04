"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { 
  Building2, 
  Smartphone, 
  UploadCloud, 
  ArrowRight, 
  Check, 
  Loader2, 
  Sparkles,
  AlertCircle 
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { supabase } from "../../lib/supabase";

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");
  
  // Org ID resolved from registration
  const [orgId, setOrgId] = React.useState("");

  // Step 1 States
  const [businessName, setBusinessName] = React.useState("");
  const [industry, setIndustry] = React.useState("Ecommerce");

  // Step 2 States
  const [phoneId, setPhoneId] = React.useState("");
  const [accessToken, setAccessToken] = React.useState("");
  const [connectionTested, setConnectionTested] = React.useState(false);
  const [connectionSuccess, setConnectionSuccess] = React.useState(false);

  // Step 3 States
  const [dragActive, setDragActive] = React.useState(false);
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [uploadSuccess, setUploadSuccess] = React.useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("converseos_org_id") || "";
      setOrgId(stored);
    }
  }, []);

  const getOrgIdFallback = async () => {
    if (orgId) return orgId;
    
    // Fallback: Query profiles linked to the current logged-in user
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (profile?.org_id) {
        setOrgId(profile.org_id);
        localStorage.setItem("converseos_org_id", profile.org_id);
        return profile.org_id;
      }
    }
    return "";
  };

  // Step 1: Save Business Name & Settings
  const handleSaveBusiness = async () => {
    if (!businessName.trim() || isLoading) return;
    setIsLoading(true);
    setErrorMsg("");

    try {
      const targetOrgId = await getOrgIdFallback();
      if (!targetOrgId) {
        throw new Error("Could not resolve organization ID. Sign up again or login.");
      }

      const { error } = await supabase
        .from("organizations")
        .update({
          name: businessName,
          settings: { industry }
        })
        .eq("id", targetOrgId);

      if (error) throw error;

      setStep(2);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to update business configuration.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Test Meta WhatsApp Connection
  const handleTestConnection = async () => {
    if (!phoneId || !accessToken || isLoading) return;
    setIsLoading(true);
    setErrorMsg("");
    setConnectionTested(true);
    setConnectionSuccess(false);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const response = await fetch(`${apiUrl}/api/webhooks/whatsapp/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: accessToken,
          phone_number_id: phoneId
        })
      });

      if (response.ok) {
        setConnectionSuccess(true);
      } else {
        const errText = await response.text();
        throw new Error(errText || "Connection test failed.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to test WhatsApp connection.");
      setConnectionSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Save WhatsApp credentials
  const handleSaveWhatsApp = async () => {
    if (!phoneId || !accessToken || isLoading) return;
    setIsLoading(true);
    setErrorMsg("");

    try {
      const targetOrgId = await getOrgIdFallback();
      const { error } = await supabase
        .from("organizations")
        .update({
          whatsapp_phone_number_id: phoneId,
          whatsapp_token: accessToken
        })
        .eq("id", targetOrgId);

      if (error) throw error;

      setStep(3);
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to save credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Handle Drag and Drop uploader
  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await handleUploadFile(e.target.files[0]);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploadingDoc(true);
    setErrorMsg("");
    
    try {
      const targetOrgId = await getOrgIdFallback();
      const formData = new FormData();
      formData.append("file", file);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
      const res = await fetch(`${apiUrl}/api/knowledge-base/upload`, {
        method: "POST",
        headers: {
          "org_id": targetOrgId
        },
        body: formData
      });

      if (res.ok) {
        setUploadSuccess(true);
        setTimeout(() => {
          router.push("/inbox");
        }, 1500);
      } else {
        const text = await res.text();
        throw new Error(text || "Failed to upload document.");
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to index document.");
    } finally {
      setUploadingDoc(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-card/45 backdrop-blur-xl border border-border/60 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden glow-indigo">
      
      {/* Wizard Header Progress */}
      <div className="flex justify-between items-center mb-8 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <span className="text-sm font-semibold tracking-tight text-foreground select-none">ConverseOS setup</span>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          Step {step} of 3
        </span>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive-foreground mb-4">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: BUSINESS SETUP */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-400" /> Tell us about your business
            </h2>
            <p className="text-xs text-muted-foreground">Setup your basic profile workspace name and industry parameters.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Business Name</label>
              <Input 
                placeholder="e.g. Rize Academy" 
                value={businessName}
                onChange={e => setBusinessName(e.target.value)}
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
          </div>

          <Button
            onClick={handleSaveBusiness}
            disabled={!businessName.trim() || isLoading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:opacity-95 shadow-md flex items-center justify-center gap-1.5"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Continue <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      )}

      {/* STEP 2: WHATSAPP CONNECT */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-indigo-400" /> Connect WhatsApp API
            </h2>
            <p className="text-xs text-muted-foreground">Setup integration parameters to receive and reply to WhatsApp clients.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Phone Number ID</label>
              <Input 
                placeholder="From Meta App Console" 
                value={phoneId}
                onChange={e => setPhoneId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Permanent System User Access Token</label>
              <Input 
                type="password"
                placeholder="EAAG..." 
                value={accessToken}
                onChange={e => setAccessToken(e.target.value)}
                required
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleTestConnection}
                disabled={!phoneId || !accessToken || isLoading}
                variant="outline"
                type="button"
                className="flex-1 text-xs border-indigo-500/20 bg-indigo-500/5 text-indigo-400 hover:bg-indigo-500/10 shadow-sm"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Test Connection"}
              </Button>
              <Button
                onClick={handleSaveWhatsApp}
                disabled={!phoneId || !accessToken || isLoading}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium hover:opacity-95 shadow-md flex items-center justify-center gap-1.5"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Connection state updates */}
            {connectionTested && (
              <div className={`text-xs p-3 rounded-lg border flex items-center gap-1.5 ${
                connectionSuccess 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                {connectionSuccess ? (
                  <>
                    <Check className="h-4 w-4" /> Credentials validated successfully.
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4" /> Verification failed. Verify credentials.
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: UPLOAD FIRST DOCUMENT */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-indigo-400" /> Catalog First Documentation
            </h2>
            <p className="text-xs text-muted-foreground">Index business FAQ documentation to train your AI chat co-pilot.</p>
          </div>

          {/* Drag & Drop Board */}
          <div
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragActive ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/45"
            }`}
            onClick={() => document.getElementById("wizard-file-input")?.click()}
          >
            <input
              id="wizard-file-input"
              type="file"
              accept=".pdf,.txt,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
            {uploadingDoc ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            ) : uploadSuccess ? (
              <Check className="h-8 w-8 text-emerald-400 mb-3" />
            ) : (
              <UploadCloud className="h-8 w-8 text-muted-foreground mb-3" />
            )}
            
            <p className="text-sm font-semibold">
              {uploadingDoc 
                ? "Indexing vectors RAG embeddings..." 
                : uploadSuccess 
                ? "Vector index verified!" 
                : "Drag & drop PDF, TXT or DOCX here"}
            </p>
            <span className="text-[10px] text-muted-foreground block mt-1">Maximum file size: 10MB</span>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => router.push("/inbox")}
              className="text-muted-foreground"
            >
              Skip for now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

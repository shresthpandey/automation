"use client";

import { OnboardingWizard } from "../../../components/shared/OnboardingWizard";

export default function OnboardingPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_bottom_left,_var(--var-gradient-stops))] from-indigo-950/30 via-background to-background px-4 py-12">
      {/* Background neon glows */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-[100px]" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-purple-500/5 blur-[120px]" />
      
      <OnboardingWizard />
    </div>
  );
}

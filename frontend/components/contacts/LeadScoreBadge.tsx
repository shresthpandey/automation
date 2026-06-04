import * as React from "react";
import { Flame } from "lucide-react";

interface LeadScoreBadgeProps {
  score: number;
  status: "hot" | "warm" | "cold" | string;
}

export function LeadScoreBadge({ score, status }: LeadScoreBadgeProps) {
  const normStatus = (status || "cold").toLowerCase();
  
  let bgClass = "bg-zinc-500/10 border-zinc-500/20 text-zinc-400";
  let label = "Cold";
  let icon = null;

  if (normStatus === "hot" || score > 70) {
    bgClass = "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-sm shadow-emerald-500/10";
    label = "Hot";
    icon = <Flame className="h-3.5 w-3.5 text-emerald-400 fill-current animate-pulse" />;
  } else if (normStatus === "warm" || (score >= 41 && score <= 70)) {
    bgClass = "bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5";
    label = "Warm";
  } else {
    bgClass = "bg-zinc-500/15 border-zinc-500/20 text-zinc-400";
    label = "Cold";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider select-none ${bgClass}`}>
      {icon}
      <span>{label} • {score}</span>
    </span>
  );
}

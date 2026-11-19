import { AlertTriangle, CheckCircle2, PauseCircle, XCircle } from "lucide-react";

interface StatusIndicatorProps {
  tone: "success" | "warning" | "error" | "muted";
  label: string;
}

export function StatusIndicator({ tone, label }: StatusIndicatorProps) {
  if (tone === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }
  if (tone === "warning") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }
  if (tone === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap">
      <PauseCircle className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

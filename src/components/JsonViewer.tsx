import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  title?: string;
  maxHeightClass?: string;
}

export function JsonViewer({
  data,
  title = "JSON Response",
  maxHeightClass = "max-h-[460px]",
}: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard unavailability
    }
  };

  return (
    <div className="border border-slate-800 bg-[#0B0F17] rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-[#111827]">
        <span className="text-xs font-medium text-slate-300">{title}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy JSON"}</span>
        </button>
      </div>
      <pre
        className={`p-4 text-xs leading-relaxed text-slate-200 font-mono overflow-auto ${maxHeightClass}`}
      >
        {formatted}
      </pre>
    </div>
  );
}

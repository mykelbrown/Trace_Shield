const CLASS: Record<string, string> = {
  CRITICAL: "bg-risk-critical/15 text-risk-critical border-risk-critical/40",
  HIGH: "bg-risk-high/15 text-risk-high border-risk-high/40",
  MEDIUM: "bg-risk-medium/15 text-risk-medium border-risk-medium/40",
  LOW: "bg-risk-low/15 text-risk-low border-risk-low/40",
};

export default function RiskBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${CLASS[level] ?? "bg-slate-800 text-slate-300 border-slate-700"}`}>
      {level}
    </span>
  );
}

export function ConfidenceBadge({ level }: { level: string }) {
  const cls =
    level === "HIGH"
      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10"
      : level === "MEDIUM"
        ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
        : level === "LOW"
          ? "text-slate-400 border-slate-600 bg-slate-800"
          : "text-slate-500 border-slate-700 bg-slate-900";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>{level}</span>;
}

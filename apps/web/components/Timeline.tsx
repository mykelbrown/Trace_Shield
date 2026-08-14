"use client";

import type { Finding } from "@dfi/core";
import RiskBadge from "@/components/RiskBadge";

export default function Timeline({ findings }: { findings: Finding[] }) {
  const sorted = [...findings]
    .filter((f) => f.exposureType !== "source_unavailable")
    .sort((a, b) => (b.firstObservedAt ?? b.discoveredAt).localeCompare(a.firstObservedAt ?? a.discoveredAt));

  if (sorted.length === 0) return <p className="text-sm text-slate-500">No findings yet.</p>;

  return (
    <div className="card p-6">
      <ol className="relative border-l border-slate-800 ml-2 space-y-6">
        {sorted.map((f) => (
          <li key={f.id} className="ml-4">
            <div className="absolute -ml-[9px] mt-1.5 h-3 w-3 rounded-full border-2 border-slate-950" style={{ background: "var(--risk-" + f.riskLevel.toLowerCase() + ")" }} />
            <time className="text-xs text-slate-500">{new Date(f.firstObservedAt ?? f.discoveredAt).toLocaleString()}</time>
            <div className="flex items-center gap-2 mt-0.5">
              <RiskBadge level={f.riskLevel} />
              <span className="font-medium text-sm">{f.title ?? f.exposureType.replace(/_/g, " ")}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {f.platform ?? f.source} · {f.evidence}
            </p>
            {f.lastObservedAt && f.lastObservedAt !== f.firstObservedAt && (
              <p className="text-[11px] text-slate-600 mt-0.5">Last observed {new Date(f.lastObservedAt).toLocaleString()}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

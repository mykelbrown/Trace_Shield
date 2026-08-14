"use client";

import type { Finding, RemediationItem, RemediationStatus } from "@dfi/core";
import RiskBadge from "@/components/RiskBadge";

const STATUS_OPTIONS: RemediationStatus[] = ["OPEN", "IN_PROGRESS", "REMOVED", "VERIFIED_REMOVED", "UNABLE_TO_REMOVE"];

const STATUS_COLOR: Record<RemediationStatus, string> = {
  OPEN: "text-slate-400",
  IN_PROGRESS: "text-amber-400",
  REMOVED: "text-emerald-400",
  VERIFIED_REMOVED: "text-emerald-300",
  UNABLE_TO_REMOVE: "text-red-400",
};

export default function RemediationTracker({
  findings,
  remediation,
  onUpdateStatus,
}: {
  findings: Finding[];
  remediation: RemediationItem[];
  onUpdateStatus: (findingId: string, status: RemediationStatus) => void;
}) {
  const findingById = new Map(findings.map((f) => [f.id, f]));
  const items = remediation
    .map((r) => ({ r, f: findingById.get(r.findingId) }))
    .filter((x): x is { r: RemediationItem; f: Finding } => Boolean(x.f))
    .sort((a, b) => rank(a.r.status) - rank(b.r.status));

  const openCount = items.filter((i) => i.r.status === "OPEN").length;

  if (items.length === 0) return <p className="text-sm text-slate-500">No remediation items yet — run a scan first.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">{openCount} of {items.length} item(s) still open.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Finding</th>
              <th className="px-3 py-2">Recommended Action</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ r, f }) => (
              <tr key={r.id} className="border-b border-slate-900 last:border-0 align-top">
                <td className="px-3 py-3">
                  <RiskBadge level={f.riskLevel} />
                </td>
                <td className="px-3 py-3 max-w-sm">
                  <div className="font-medium">{f.title ?? f.exposureType.replace(/_/g, " ")}</div>
                  <div className="text-xs text-slate-500">{f.platform ?? f.source}</div>
                </td>
                <td className="px-3 py-3 max-w-sm text-slate-400">{r.action}</td>
                <td className="px-3 py-3">
                  <select
                    value={r.status}
                    onChange={(e) => onUpdateStatus(f.id, e.target.value as RemediationStatus)}
                    className={`rounded-md bg-slate-950 border border-slate-800 px-2 py-1 text-xs ${STATUS_COLOR[r.status]}`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">{new Date(r.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function rank(s: RemediationStatus): number {
  return { OPEN: 0, IN_PROGRESS: 1, UNABLE_TO_REMOVE: 2, REMOVED: 3, VERIFIED_REMOVED: 4 }[s];
}

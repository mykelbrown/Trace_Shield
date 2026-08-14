"use client";

import { useMemo, useState } from "react";
import type { Finding, RemediationItem, RemediationStatus } from "@dfi/core";
import RiskBadge, { ConfidenceBadge } from "@/components/RiskBadge";

const STATUS_OPTIONS: RemediationStatus[] = ["OPEN", "IN_PROGRESS", "REMOVED", "VERIFIED_REMOVED", "UNABLE_TO_REMOVE"];

export default function FindingsTable({
  findings,
  remediationByFinding,
  onUpdateStatus,
}: {
  findings: Finding[];
  remediationByFinding: Map<string, RemediationItem>;
  onUpdateStatus: (findingId: string, status: RemediationStatus) => void;
}) {
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [confidenceFilter, setConfidenceFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const sources = useMemo(() => Array.from(new Set(findings.map((f) => f.source))).sort(), [findings]);

  const filtered = findings.filter((f) => {
    if (riskFilter !== "ALL" && f.riskLevel !== riskFilter) return false;
    if (confidenceFilter !== "ALL" && f.identityConfidence !== confidenceFilter) return false;
    if (sourceFilter !== "ALL" && f.source !== sourceFilter) return false;
    if (query && !`${f.title ?? ""} ${f.identifierValue} ${f.platform ?? ""} ${f.snippet ?? ""}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          placeholder="Search findings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-md bg-slate-950 border border-slate-800 px-3 py-1.5 text-sm w-56"
        />
        <Select label="Risk" value={riskFilter} onChange={setRiskFilter} options={["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"]} />
        <Select label="Confidence" value={confidenceFilter} onChange={setConfidenceFilter} options={["ALL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]} />
        <Select label="Source" value={sourceFilter} onChange={setSourceFilter} options={["ALL", ...sources]} />
        <span className="text-xs text-slate-500 self-center">{filtered.length} of {findings.length}</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
            <tr>
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Finding</th>
              <th className="px-3 py-2">Source / Platform</th>
              <th className="px-3 py-2">Confidence</th>
              <th className="px-3 py-2">First seen</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <tr key={f.id} className="border-b border-slate-900 last:border-0 align-top">
                <td className="px-3 py-3">
                  <RiskBadge level={f.riskLevel} />
                </td>
                <td className="px-3 py-3 max-w-md">
                  <div className="font-medium">{f.title ?? f.exposureType.replace(/_/g, " ")}</div>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline break-all">
                      {f.url}
                    </a>
                  )}
                  <div className="text-xs text-slate-500 mt-1">{f.evidence}</div>
                  {f.confidenceReason && <div className="text-xs text-slate-600 mt-1 italic">{f.confidenceReason}</div>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <div>{f.platform ?? f.source}</div>
                  <div className="text-xs text-slate-500">{f.module}</div>
                  {f.providerMode !== "live" && <div className="text-[10px] text-amber-500 uppercase mt-0.5">{f.providerMode}</div>}
                </td>
                <td className="px-3 py-3">
                  <ConfidenceBadge level={f.identityConfidence} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-500">{f.firstObservedAt ? new Date(f.firstObservedAt).toLocaleDateString() : "—"}</td>
                <td className="px-3 py-3">
                  <select
                    value={remediationByFinding.get(f.id)?.status ?? f.status}
                    onChange={(e) => onUpdateStatus(f.id, e.target.value as RemediationStatus)}
                    className="rounded-md bg-slate-950 border border-slate-800 px-2 py-1 text-xs"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                  No findings match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-slate-950 border border-slate-800 px-2 py-1.5 text-sm"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {label}: {o}
        </option>
      ))}
    </select>
  );
}

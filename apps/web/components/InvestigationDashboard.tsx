"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Finding,
  IdentityGraph,
  Investigation,
  RemediationItem,
  RemediationStatus,
  ResearchLogEntry,
  RiskScore,
  SocialEngineeringInsight,
} from "@dfi/core";
import ScoreGauge from "@/components/ScoreGauge";
import RiskBadge, { ConfidenceBadge } from "@/components/RiskBadge";
import IdentityGraphView from "@/components/IdentityGraphView";
import FindingsTable from "@/components/FindingsTable";
import Timeline from "@/components/Timeline";
import RemediationTracker from "@/components/RemediationTracker";

type Tab = "overview" | "graph" | "findings" | "timeline" | "remediation" | "log";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "graph", label: "Identity Graph" },
  { id: "findings", label: "Findings" },
  { id: "timeline", label: "Timeline" },
  { id: "remediation", label: "Remediation" },
  { id: "log", label: "Research Log" },
];

export default function InvestigationDashboard({
  investigation,
  findings,
  risk,
  graph,
  socialEngineering,
  remediation,
  logEntries,
}: {
  investigation: Investigation;
  findings: Finding[];
  risk: RiskScore;
  graph: IdentityGraph;
  socialEngineering: SocialEngineeringInsight[];
  remediation: RemediationItem[];
  logEntries: ResearchLogEntry[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [rescanning, setRescanning] = useState(false);
  const [remediationState, setRemediationState] = useState(remediation);
  const [findingsState, setFindingsState] = useState(findings);

  const remediationByFinding = useMemo(() => {
    const m = new Map<string, RemediationItem>();
    for (const r of remediationState) m.set(r.findingId, r);
    return m;
  }, [remediationState]);

  async function rescan() {
    setRescanning(true);
    try {
      const res = await fetch(`/api/investigations/${investigation.id}/scan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (res.ok) router.refresh();
    } finally {
      setRescanning(false);
    }
  }

  async function updateStatus(findingId: string, status: RemediationStatus) {
    setFindingsState((fs) => fs.map((f) => (f.id === findingId ? { ...f, status } : f)));
    setRemediationState((rs) => rs.map((r) => (r.findingId === findingId ? { ...r, status, updatedAt: new Date().toISOString() } : r)));
    await fetch(`/api/findings/${findingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{investigation.name}</h1>
          <p className="text-xs text-slate-500 mt-1">
            {investigation.seeds.length} seed(s) · {findingsState.length} finding(s) · updated {new Date(investigation.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={rescan}
            disabled={rescanning}
            className="rounded-md border border-slate-700 hover:border-cyan-500/60 px-3 py-2 text-sm disabled:opacity-50"
          >
            {rescanning ? "Re-scanning…" : "Re-scan"}
          </button>
          <a href={`/api/investigations/${investigation.id}/report?format=html`} target="_blank" className="rounded-md border border-slate-700 hover:border-cyan-500/60 px-3 py-2 text-sm">
            HTML Report
          </a>
          <a href={`/api/investigations/${investigation.id}/report?format=pdf`} className="rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-2 text-sm">
            Download PDF
          </a>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-cyan-400 text-cyan-300" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="card p-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <ScoreGauge label="Overall Exposure" value={risk.exposureScore} />
            <ScoreGauge label="Identity Risk" value={risk.identityRisk} />
            <ScoreGauge label="Privacy Risk" value={risk.privacyRisk} />
            <ScoreGauge label="Social Engineering Risk" value={risk.socialEngineeringRisk} />
            <ScoreGauge label="Account Takeover Risk" value={risk.accountTakeoverRisk} />
            <ScoreGauge label="Reputation Risk" value={risk.reputationRisk} />
          </div>

          <div className="flex flex-wrap gap-3">
            <CountChip label="Critical" value={risk.counts.critical} className="bg-risk-critical/15 text-risk-critical border-risk-critical/40" />
            <CountChip label="High" value={risk.counts.high} className="bg-risk-high/15 text-risk-high border-risk-high/40" />
            <CountChip label="Medium" value={risk.counts.medium} className="bg-risk-medium/15 text-risk-medium border-risk-medium/40" />
            <CountChip label="Low" value={risk.counts.low} className="bg-risk-low/15 text-risk-low border-risk-low/40" />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Social Engineering Risk Analysis</h3>
            {socialEngineering.length === 0 ? (
              <p className="text-sm text-slate-500">No significant social-engineering attack surface identified from current findings.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {socialEngineering.map((i, idx) => (
                  <div key={idx} className="card p-4 border-amber-500/20 bg-amber-500/[0.03]">
                    <div className="font-medium text-amber-300">{i.potentialAttack}</div>
                    <p className="text-xs text-slate-400 mt-1">
                      <span className="text-slate-500">An attacker could determine:</span> {i.attackerCanDetermine.join(", ")}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">{i.why}</p>
                    <ul className="mt-2 space-y-1">
                      {i.mitigation.map((m, mi) => (
                        <li key={mi} className="text-xs text-emerald-400/90">
                          ✓ {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Investigation Seeds</h3>
            <div className="flex flex-wrap gap-2">
              {investigation.seeds.map((s) => (
                <span key={s.id} className="text-xs rounded-full border border-slate-800 bg-slate-900 px-3 py-1">
                  <span className="text-slate-500">{s.type}:</span> {s.value}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "graph" && <IdentityGraphView graph={graph} />}
      {tab === "findings" && <FindingsTable findings={findingsState} remediationByFinding={remediationByFinding} onUpdateStatus={updateStatus} />}
      {tab === "timeline" && <Timeline findings={findingsState} />}
      {tab === "remediation" && <RemediationTracker findings={findingsState} remediation={remediationState} onUpdateStatus={updateStatus} />}
      {tab === "log" && <ResearchLogView entries={logEntries} />}
    </div>
  );
}

function CountChip({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${className}`}>
      <span className="font-bold">{value}</span> {label}
    </span>
  );
}

function ResearchLogView({ entries }: { entries: ResearchLogEntry[] }) {
  if (entries.length === 0) return <p className="text-sm text-slate-500">No research log entries yet.</p>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-800">
          <tr>
            <th className="px-3 py-2">Time</th>
            <th className="px-3 py-2">Module</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Query</th>
            <th className="px-3 py-2">Result</th>
            <th className="px-3 py-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-slate-900 last:border-0">
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(e.timestamp).toLocaleString()}</td>
              <td className="px-3 py-2">{e.module}</td>
              <td className="px-3 py-2">{e.source}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-400 max-w-xs truncate">{e.query}</td>
              <td className="px-3 py-2">{e.result}</td>
              <td className="px-3 py-2">
                <ConfidenceBadge level={e.confidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

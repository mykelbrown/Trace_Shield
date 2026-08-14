import { notFound } from "next/navigation";
import { buildIdentityGraph, computeRiskScore, socialEngineeringAnalysis } from "@dfi/core";
import { getServerConfig, getServerDb } from "@/lib/server/db";
import InvestigationDashboard from "@/components/InvestigationDashboard";

export const dynamic = "force-dynamic";

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getServerDb();
  const investigation = db.getInvestigation(id);
  if (!investigation) notFound();

  const config = getServerConfig();
  const findings = db.listFindings(id);
  const risk = computeRiskScore(findings, config);
  const graph = buildIdentityGraph(investigation.seeds, findings);
  const socialEngineering = socialEngineeringAnalysis(findings);
  const remediation = db.listRemediation(id);
  const logEntries = db.listLogEntries(id).slice(0, 500);

  return (
    <InvestigationDashboard
      investigation={investigation}
      findings={findings}
      risk={risk}
      graph={graph}
      socialEngineering={socialEngineering}
      remediation={remediation}
      logEntries={logEntries}
    />
  );
}

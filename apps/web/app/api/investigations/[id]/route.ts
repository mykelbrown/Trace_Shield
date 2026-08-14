import { NextRequest, NextResponse } from "next/server";
import { buildIdentityGraph, computeRiskScore, socialEngineeringAnalysis } from "@dfi/core";
import { getServerConfig, getServerDb } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getServerDb();
  const investigation = db.getInvestigation(id);
  if (!investigation) return NextResponse.json({ error: "Investigation not found" }, { status: 404 });

  const config = getServerConfig();
  const findings = db.listFindings(id);
  const risk = computeRiskScore(findings, config);
  const graph = buildIdentityGraph(investigation.seeds, findings);
  const socialEngineering = socialEngineeringAnalysis(findings);
  const remediation = db.listRemediation(id);
  const logEntries = db.listLogEntries(id).slice(0, 500);

  return NextResponse.json({ investigation, findings, risk, graph, socialEngineering, remediation, logEntries });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getServerDb();
  if (!db.getInvestigation(id)) return NextResponse.json({ error: "Investigation not found" }, { status: 404 });
  db.deleteInvestigation(id);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { computeRiskScore, socialEngineeringAnalysis } from "@dfi/core";
import { generateHtmlReport, renderHtmlToPdf } from "@dfi/report";
import { getServerConfig, getServerDb } from "@/lib/server/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "html";
  const db = getServerDb();
  const investigation = db.getInvestigation(id);
  if (!investigation) return NextResponse.json({ error: "Investigation not found" }, { status: 404 });

  const config = getServerConfig();
  const findings = db.listFindings(id);
  const risk = computeRiskScore(findings, config);
  const socialEngineering = socialEngineeringAnalysis(findings);
  const html = generateHtmlReport({ investigation, findings, risk, socialEngineering, generatedAt: new Date().toISOString() });

  const safeName = investigation.name.replace(/[^a-z0-9-_]+/gi, "_");
  if (format === "pdf") {
    const pdf = await renderHtmlToPdf(html);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dfi-report-${safeName}.pdf"`,
      },
    });
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="dfi-report-${safeName}.html"`,
    },
  });
}

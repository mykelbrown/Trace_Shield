import { NextRequest, NextResponse } from "next/server";
import { newId, type Seed, type SeedType } from "@dfi/core";
import { runInvestigation } from "@dfi/providers";
import { getServerConfig, getServerDb } from "@/lib/server/db";

export const runtime = "nodejs";

const VALID_TYPES: SeedType[] = [
  "name", "email", "phone", "address", "username", "domain", "social_profile", "employer", "university", "certification", "other",
];

/**
 * POST body:
 *  {}                      -> re-scan (rescan) every existing seed (spec: "re-scan capability")
 *  { seeds: [...] }        -> add new seeds and scan only those
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = getServerDb();
  const investigation = db.getInvestigation(id);
  if (!investigation) return NextResponse.json({ error: "Investigation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const config = getServerConfig();

  let seedIds: string[] | undefined;
  if (Array.isArray(body.seeds) && body.seeds.length > 0) {
    const now = new Date().toISOString();
    seedIds = [];
    for (const s of body.seeds) {
      if (!s || typeof s.value !== "string" || !s.value.trim() || !VALID_TYPES.includes(s.type)) continue;
      const seed: Seed = { id: newId("seed"), investigationId: id, type: s.type, value: s.value.trim(), label: s.label?.trim() || undefined, addedAt: now };
      db.addSeed(seed);
      investigation.seeds.push(seed);
      seedIds.push(seed.id);
    }
    if (seedIds.length === 0) return NextResponse.json({ error: "No valid seeds supplied." }, { status: 400 });
  }

  const result = await runInvestigation(db, investigation, config, seedIds ? { seedIds } : {});
  return NextResponse.json({
    risk: result.risk,
    findingCount: result.findings.length,
    unavailableCount: result.unavailable.length,
    unavailable: result.unavailable,
  });
}

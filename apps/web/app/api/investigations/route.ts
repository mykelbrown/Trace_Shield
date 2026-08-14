import { NextRequest, NextResponse } from "next/server";
import { newId, type Seed, type SeedType, type Investigation } from "@dfi/core";
import { runInvestigation } from "@dfi/providers";
import { getServerConfig, getServerDb } from "@/lib/server/db";

export const runtime = "nodejs";

const VALID_TYPES: SeedType[] = [
  "name",
  "email",
  "phone",
  "address",
  "username",
  "domain",
  "social_profile",
  "employer",
  "university",
  "certification",
  "other",
];

export async function GET() {
  const db = getServerDb();
  const investigations = db.listInvestigations().map((inv) => {
    const findings = db.listFindings(inv.id);
    return { ...inv, findingCount: findings.length };
  });
  return NextResponse.json({ investigations });
}

interface SeedInput {
  type: string;
  value: string;
  label?: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !Array.isArray(body.seeds)) {
    return NextResponse.json({ error: "Expected { name: string, seeds: {type, value, label?}[] }" }, { status: 400 });
  }

  const seedsInput = (body.seeds as SeedInput[]).filter((s) => {
    return s && typeof s.value === "string" && s.value.trim().length > 0 && VALID_TYPES.includes(s.type as SeedType);
  });

  if (seedsInput.length === 0) {
    return NextResponse.json({ error: "At least one valid identifier is required." }, { status: 400 });
  }

  const db = getServerDb();
  const now = new Date().toISOString();
  const investigationId = newId("inv");
  const seeds: Seed[] = seedsInput.map((s) => ({
    id: newId("seed"),
    investigationId,
    type: s.type as SeedType,
    value: s.value.trim(),
    label: s.label?.trim() || undefined,
    addedAt: now,
  }));
  const investigation: Investigation = { id: investigationId, name: body.name.trim() || "Untitled investigation", createdAt: now, updatedAt: now, seeds };
  db.createInvestigation(investigation);

  const runNow = body.runNow !== false;
  if (runNow) {
    const config = getServerConfig();
    const result = await runInvestigation(db, investigation, config);
    return NextResponse.json({ investigation, risk: result.risk, findingCount: result.findings.length }, { status: 201 });
  }

  return NextResponse.json({ investigation }, { status: 201 });
}

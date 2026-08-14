import { NextRequest, NextResponse } from "next/server";
import type { RemediationStatus } from "@dfi/core";
import { getServerDb } from "@/lib/server/db";

export const runtime = "nodejs";

const VALID_STATUSES: RemediationStatus[] = ["OPEN", "IN_PROGRESS", "REMOVED", "VERIFIED_REMOVED", "UNABLE_TO_REMOVE"];

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const db = getServerDb();
  const updated = db.updateFindingStatus(id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  const rem = db.conn.prepare(`SELECT * FROM remediation WHERE finding_id = ?`).get(id) as any;
  if (rem) {
    db.conn
      .prepare(`UPDATE remediation SET status = ?, updated_at = ?, notes = COALESCE(?, notes) WHERE finding_id = ?`)
      .run(body.status, new Date().toISOString(), body.notes ?? null, id);
  }

  return NextResponse.json({ ok: true });
}

import { describe, it, expect, beforeEach } from "vitest";
import { Db } from "../src/db";
import { computeDedupeKey } from "../src/dedup";
import type { Finding, Investigation, Seed } from "../src/types";

function makeInvestigation(): Investigation {
  const seeds: Seed[] = [{ id: "seed_1", investigationId: "inv_1", type: "email", value: "alex.morgan@example.com", addedAt: "2026-01-01T00:00:00.000Z" }];
  return { id: "inv_1", name: "Test investigation", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", seeds };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  const base: Finding = {
    id: "fnd_1",
    investigationId: "inv_1",
    seedId: "seed_1",
    identifierType: "email",
    identifierValue: "alex.morgan@example.com",
    module: "search_engine",
    source: "brave_search",
    providerMode: "mock",
    evidence: "test evidence",
    exposureType: "email_exposed_publicly",
    riskLevel: "MEDIUM",
    identityConfidence: "LOW",
    confidenceReason: "test",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    metadata: { foo: "bar" },
    redacted: false,
    status: "OPEN",
    recommendedAction: "review",
    dedupeKey: "",
  };
  const merged = { ...base, ...overrides };
  merged.dedupeKey = merged.dedupeKey || computeDedupeKey(merged);
  return merged;
}

describe("Db", () => {
  let db: Db;
  beforeEach(() => {
    db = new Db(":memory:");
  });

  it("creates and retrieves an investigation with its seeds", () => {
    db.createInvestigation(makeInvestigation());
    const inv = db.getInvestigation("inv_1");
    expect(inv).toBeDefined();
    expect(inv!.seeds).toHaveLength(1);
    expect(inv!.seeds[0].value).toBe("alex.morgan@example.com");
  });

  it("updateFindingStatus reports whether a matching finding existed", () => {
    db.createInvestigation(makeInvestigation());
    db.upsertFinding(makeFinding());
    expect(db.updateFindingStatus("fnd_1", "IN_PROGRESS")).toBe(true);
    expect(db.updateFindingStatus("fnd_does_not_exist", "IN_PROGRESS")).toBe(false);
  });

  it("upserts a finding and preserves remediation status across a re-scan", () => {
    db.createInvestigation(makeInvestigation());
    db.upsertFinding(makeFinding());
    db.updateFindingStatus("fnd_1", "IN_PROGRESS");

    // Simulate a re-scan producing the same finding again (same dedupe key, new id).
    const rescanned = makeFinding({ id: "fnd_2", discoveredAt: "2026-02-01T00:00:00.000Z" });
    db.upsertFinding(rescanned);

    const findings = db.listFindings("inv_1");
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe("IN_PROGRESS");
  });

  it("rejects SQL injection attempts in identifier values (parameterized queries)", () => {
    db.createInvestigation(makeInvestigation());
    const malicious = makeFinding({ id: "fnd_evil", identifierValue: "'; DROP TABLE investigations; --" });
    expect(() => db.upsertFinding(malicious)).not.toThrow();
    expect(db.getInvestigation("inv_1")).toBeDefined();
    expect(db.listFindings("inv_1").some((f) => f.identifierValue.includes("DROP TABLE"))).toBe(true);
  });

  it("prunes research log entries older than the retention window", () => {
    db.createInvestigation(makeInvestigation());
    db.addLogEntry({
      id: "log_old",
      investigationId: "inv_1",
      timestamp: new Date(Date.now() - 200 * 86400000).toISOString(),
      query: "old query",
      source: "brave_search",
      result: "1 result",
      identifierSearched: "alex.morgan@example.com",
      module: "search_engine",
      confidence: "LOW",
    });
    db.addLogEntry({
      id: "log_new",
      investigationId: "inv_1",
      timestamp: new Date().toISOString(),
      query: "new query",
      source: "brave_search",
      result: "1 result",
      identifierSearched: "alex.morgan@example.com",
      module: "search_engine",
      confidence: "LOW",
    });
    db.pruneResearchLog(90);
    const remaining = db.listLogEntries("inv_1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("log_new");
  });

  it("deletes an investigation and all of its dependent rows", () => {
    db.createInvestigation(makeInvestigation());
    db.upsertFinding(makeFinding());
    db.deleteInvestigation("inv_1");
    expect(db.getInvestigation("inv_1")).toBeUndefined();
    expect(db.listFindings("inv_1")).toHaveLength(0);
  });
});

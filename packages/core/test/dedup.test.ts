import { describe, it, expect } from "vitest";
import { computeDedupeKey, deduplicateFindings } from "../src/dedup";
import type { Finding } from "../src/types";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  const base: Finding = {
    id: overrides.id ?? "fnd_1",
    investigationId: "inv_1",
    seedId: "seed_1",
    identifierType: "email",
    identifierValue: "alex.morgan@example.com",
    module: "search_engine",
    source: "brave_search",
    providerMode: "mock",
    title: "Example listing",
    url: "https://example.invalid/profile/alex",
    evidence: "Found in a mock search result.",
    exposureType: "email_exposed_publicly",
    riskLevel: "MEDIUM",
    identityConfidence: "LOW",
    confidenceReason: "single source",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    lastObservedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    redacted: false,
    status: "OPEN",
    recommendedAction: "Review manually.",
    dedupeKey: "",
  };
  const merged = { ...base, ...overrides };
  merged.dedupeKey = merged.dedupeKey || computeDedupeKey(merged);
  return merged;
}

describe("computeDedupeKey", () => {
  it("is stable for identical inputs", () => {
    const a = computeDedupeKey({ source: "x", url: "https://a", identifierValue: "v", exposureType: "email_exposed_publicly", platform: undefined });
    const b = computeDedupeKey({ source: "x", url: "https://a", identifierValue: "v", exposureType: "email_exposed_publicly", platform: undefined });
    expect(a).toBe(b);
  });
  it("differs when the URL differs", () => {
    const a = computeDedupeKey({ source: "x", url: "https://a", identifierValue: "v", exposureType: "email_exposed_publicly", platform: undefined });
    const b = computeDedupeKey({ source: "x", url: "https://b", identifierValue: "v", exposureType: "email_exposed_publicly", platform: undefined });
    expect(a).not.toBe(b);
  });
});

describe("deduplicateFindings", () => {
  it("merges exact duplicates into a single finding", () => {
    const f1 = makeFinding({ id: "fnd_1", discoveredAt: "2026-01-01T00:00:00.000Z" });
    const f2 = makeFinding({ id: "fnd_2", discoveredAt: "2026-02-01T00:00:00.000Z" });
    const merged = deduplicateFindings([f1, f2]);
    expect(merged).toHaveLength(1);
  });

  it("tracks the earliest firstObservedAt and latest lastObservedAt across duplicates", () => {
    const f1 = makeFinding({ id: "fnd_1", discoveredAt: "2026-02-01T00:00:00.000Z", firstObservedAt: "2026-02-01T00:00:00.000Z", lastObservedAt: "2026-02-01T00:00:00.000Z" });
    const f2 = makeFinding({ id: "fnd_2", discoveredAt: "2026-01-01T00:00:00.000Z", firstObservedAt: "2026-01-01T00:00:00.000Z", lastObservedAt: "2026-01-01T00:00:00.000Z" });
    const f3 = makeFinding({ id: "fnd_3", discoveredAt: "2026-03-01T00:00:00.000Z", firstObservedAt: "2026-03-01T00:00:00.000Z", lastObservedAt: "2026-03-01T00:00:00.000Z" });
    const [merged] = deduplicateFindings([f1, f2, f3]);
    expect(merged.firstObservedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(merged.lastObservedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("keeps distinct findings separate when their dedupe keys differ", () => {
    const f1 = makeFinding({ id: "fnd_1", url: "https://a.invalid" });
    const f2 = makeFinding({ id: "fnd_2", url: "https://b.invalid" });
    expect(deduplicateFindings([f1, f2])).toHaveLength(2);
  });
});

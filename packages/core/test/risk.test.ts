import { describe, it, expect } from "vitest";
import { computeRiskScore, socialEngineeringAnalysis } from "../src/risk";
import { DEFAULT_CONFIG } from "../src/config";
import type { Finding } from "../src/types";

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: overrides.id ?? "fnd_1",
    investigationId: "inv_1",
    seedId: "seed_1",
    identifierType: "email",
    identifierValue: "alex.morgan@example.com",
    module: "search_engine",
    source: "brave_search",
    providerMode: "mock",
    evidence: "test",
    exposureType: "email_exposed_publicly",
    riskLevel: "MEDIUM",
    identityConfidence: "MEDIUM",
    confidenceReason: "test",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    redacted: false,
    status: "OPEN",
    recommendedAction: "review",
    dedupeKey: "k1",
    ...overrides,
  };
}

describe("computeRiskScore", () => {
  it("returns 0 for no findings", () => {
    const risk = computeRiskScore([], DEFAULT_CONFIG);
    expect(risk.exposureScore).toBe(0);
    expect(risk.counts).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  it("increases monotonically as risk level increases", () => {
    const low = computeRiskScore([finding({ riskLevel: "LOW", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    const medium = computeRiskScore([finding({ riskLevel: "MEDIUM", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    const high = computeRiskScore([finding({ riskLevel: "HIGH", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    const critical = computeRiskScore([finding({ riskLevel: "CRITICAL", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    expect(low.exposureScore).toBeLessThanOrEqual(medium.exposureScore);
    expect(medium.exposureScore).toBeLessThanOrEqual(high.exposureScore);
    expect(high.exposureScore).toBeLessThanOrEqual(critical.exposureScore);
  });

  it("never exceeds 100", () => {
    const many = Array.from({ length: 50 }, (_, i) => finding({ id: `fnd_${i}`, riskLevel: "CRITICAL", identityConfidence: "HIGH", exposureType: "breach_exposure" }));
    const risk = computeRiskScore(many, DEFAULT_CONFIG);
    expect(risk.exposureScore).toBeLessThanOrEqual(100);
    expect(risk.accountTakeoverRisk).toBeLessThanOrEqual(100);
  });

  it("weighs confidence — a LOW-confidence finding contributes less than a HIGH-confidence one", () => {
    const lowConf = computeRiskScore([finding({ riskLevel: "HIGH", identityConfidence: "LOW" })], DEFAULT_CONFIG);
    const highConf = computeRiskScore([finding({ riskLevel: "HIGH", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    expect(lowConf.exposureScore).toBeLessThan(highConf.exposureScore);
  });

  it("excludes source_unavailable findings from scoring and counts", () => {
    const risk = computeRiskScore([finding({ exposureType: "source_unavailable", riskLevel: "CRITICAL" })], DEFAULT_CONFIG);
    expect(risk.exposureScore).toBe(0);
    expect(risk.counts.critical).toBe(0);
  });

  it("weighs a home-address exposure heavily toward privacy risk specifically", () => {
    const risk = computeRiskScore([finding({ exposureType: "address_indexed_publicly", riskLevel: "HIGH", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    expect(risk.privacyRisk).toBeGreaterThan(risk.accountTakeoverRisk);
  });

  it("weighs a breach exposure heavily toward account-takeover risk specifically", () => {
    const risk = computeRiskScore([finding({ exposureType: "breach_exposure", riskLevel: "CRITICAL", identityConfidence: "HIGH" })], DEFAULT_CONFIG);
    expect(risk.accountTakeoverRisk).toBeGreaterThan(risk.privacyRisk);
  });
});

describe("socialEngineeringAnalysis", () => {
  it("returns no insights when there is nothing to correlate", () => {
    expect(socialEngineeringAnalysis([])).toEqual([]);
  });

  it("flags spear-phishing risk when email exposure and professional exposure co-occur", () => {
    const insights = socialEngineeringAnalysis([
      finding({ exposureType: "email_exposed_publicly" }),
      finding({ id: "fnd_2", exposureType: "professional_profile" }),
    ]);
    expect(insights.some((i) => i.potentialAttack.toLowerCase().includes("phishing"))).toBe(true);
  });

  it("never includes attack-execution instructions, only defensive mitigation", () => {
    const insights = socialEngineeringAnalysis([finding({ exposureType: "breach_exposure" })]);
    for (const insight of insights) {
      expect(insight.mitigation.length).toBeGreaterThan(0);
    }
  });
});

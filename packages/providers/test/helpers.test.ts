import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, type ProviderContext, type Seed } from "@dfi/core";
import { normalizeFinding, validateFinding } from "../src/helpers";

const seed: Seed = { id: "s1", investigationId: "inv", type: "username", value: "alexmorgan_test", addedAt: "2026-01-01T00:00:00.000Z" };
const ctx: ProviderContext = { investigationId: "inv", config: DEFAULT_CONFIG, now: () => "2026-01-01T00:00:00.000Z" };

describe("normalizeFinding", () => {
  it("escalates risk to CRITICAL and redacts when a secret is detected in the snippet", () => {
    const finding = normalizeFinding(
      {
        seed,
        module: "github",
        source: "github",
        providerMode: "live",
        snippet: "aws_key = AKIAABCDEFGHIJKLMNOP",
        evidence: "found in repo",
        exposureType: "code_repository_exposure",
        riskLevel: "MEDIUM", // caller's guess — must be overridden
        identityConfidence: "MEDIUM",
        confidenceReason: "test",
      },
      ctx
    );
    expect(finding.riskLevel).toBe("CRITICAL");
    expect(finding.redacted).toBe(true);
    expect(finding.snippet).not.toContain("AKIAABCDEFGHIJKLMNOP");
    expect(finding.snippet).toContain("[REDACTED:");
  });

  it("computes a stable, non-empty dedupe key", () => {
    const finding = normalizeFinding(
      { seed, module: "search_engine", source: "brave_search", providerMode: "mock", evidence: "e", exposureType: "email_exposed_publicly", riskLevel: "LOW", identityConfidence: "LOW", confidenceReason: "c" },
      ctx
    );
    expect(finding.dedupeKey).toMatch(/^[a-f0-9]{24}$/);
  });

  it("assigns a default recommended action when the caller doesn't supply one", () => {
    const finding = normalizeFinding(
      { seed, module: "breach", source: "hibp", providerMode: "mock", evidence: "e", exposureType: "breach_exposure", riskLevel: "CRITICAL", identityConfidence: "HIGH", confidenceReason: "c" },
      ctx
    );
    expect(finding.recommendedAction.length).toBeGreaterThan(0);
  });
});

describe("validateFinding", () => {
  it("rejects a finding with empty evidence", () => {
    const finding = normalizeFinding(
      { seed, module: "search_engine", source: "s", providerMode: "mock", evidence: "  ", exposureType: "email_exposed_publicly", riskLevel: "LOW", identityConfidence: "LOW", confidenceReason: "c" },
      ctx
    );
    expect(validateFinding(finding)).toBe(false);
  });

  it("accepts a well-formed finding", () => {
    const finding = normalizeFinding(
      { seed, module: "search_engine", source: "s", providerMode: "mock", url: "https://example.invalid/x", evidence: "found it", exposureType: "email_exposed_publicly", riskLevel: "LOW", identityConfidence: "LOW", confidenceReason: "c" },
      ctx
    );
    expect(validateFinding(finding)).toBe(true);
  });
});

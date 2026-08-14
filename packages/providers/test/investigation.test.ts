import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  Db,
  DEFAULT_CONFIG,
  newId,
  type ProviderContext,
  type ProviderResult,
  type Seed,
  type SeedType,
} from "@dfi/core";
import type { OsintProvider } from "../src/types";
import { normalizeFinding, validateFinding } from "../src/helpers";
import { newInvestigation, runInvestigation } from "../src/investigation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../fixtures/alex-morgan.json"), "utf-8"));

// Deterministic, network-free mock providers standing in for the real OSINT
// sources — this is what "integration tests using mock providers" (spec
// section 30) means: exercise the full orchestration without touching the
// network or depending on live third-party state.
const mockSearchEngine: OsintProvider = {
  name: "mock_search_engine",
  label: "Mock Search Engine",
  module: "search_engine",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => t === "email",
  async search(seed, ctx): Promise<ProviderResult> {
    const finding = normalizeFinding(
      {
        seed,
        module: "search_engine",
        source: "mock_search_engine",
        providerMode: "mock",
        title: "Public directory listing",
        url: "https://directory.example.invalid/alex-morgan",
        evidence: `"${seed.value}" found in a public directory listing.`,
        exposureType: "email_exposed_publicly",
        riskLevel: "MEDIUM",
        identityConfidence: "MEDIUM",
        confidenceReason: "Matched in a mock directory result.",
        metadata: { employer: "Acme Corp" },
      },
      ctx
    );
    return { findings: [finding], logEntries: [], unavailable: [] };
  },
};

const mockBreachChecker: OsintProvider = {
  name: "mock_breach_checker",
  label: "Mock Breach Checker",
  module: "breach",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => t === "email",
  async search(seed, ctx): Promise<ProviderResult> {
    const finding = normalizeFinding(
      {
        seed,
        module: "breach",
        source: "mock_breach_checker",
        providerMode: "mock",
        title: "Breach: MockDataCo",
        evidence: `"${seed.value}" appears in the simulated breach "MockDataCo".`,
        exposureType: "email_appears_in_breach",
        riskLevel: "CRITICAL",
        identityConfidence: "HIGH",
        confidenceReason: "Exact email match reported by a breach-notification service.",
        metadata: { breachName: "MockDataCo" },
      },
      ctx
    );
    return { findings: [finding], logEntries: [], unavailable: [] };
  },
};

const mockGithub: OsintProvider = {
  name: "mock_github",
  label: "Mock GitHub",
  module: "github",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => t === "username",
  async search(seed, ctx): Promise<ProviderResult> {
    const finding = normalizeFinding(
      {
        seed,
        module: "github",
        source: "mock_github",
        providerMode: "mock",
        platform: "GitHub",
        title: `GitHub: @${seed.value}`,
        url: `https://github.com/${seed.value}`,
        evidence: "Exact username match on GitHub.",
        exposureType: "username_match",
        riskLevel: "MEDIUM",
        identityConfidence: "HIGH",
        confidenceReason: "Exact username match with an active profile.",
        metadata: { employer: "Acme Corp" },
      },
      ctx
    );
    return { findings: [finding], logEntries: [], unavailable: [] };
  },
};

const mockSourceUnavailable: OsintProvider = {
  name: "mock_blocked_platform",
  label: "Mock Blocked Platform",
  module: "username",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => t === "username",
  async search(_seed, _ctx): Promise<ProviderResult> {
    return {
      findings: [],
      logEntries: [],
      unavailable: [{ source: "mock_blocked_platform", reason: "Platform blocks automated access.", url: "https://blocked.example.invalid", recommendedManualVerification: "Check manually while logged in." }],
    };
  },
};

const MOCK_PROVIDERS = [mockSearchEngine, mockBreachChecker, mockGithub, mockSourceUnavailable];

describe("runInvestigation (integration, mock providers, fictional identity)", () => {
  let db: Db;

  beforeEach(() => {
    db = new Db(":memory:");
  });

  it("runs the fictional Alex Morgan demo identity end-to-end", async () => {
    const investigation = newInvestigation(
      fixture.name,
      fixture.seeds.map((s: { type: SeedType; value: string; label?: string }) => ({ type: s.type, value: s.value, label: s.label }))
    );
    db.createInvestigation(investigation);

    const result = await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: MOCK_PROVIDERS });

    // Collection: every mock provider that supports a seed type produced a finding.
    expect(result.findings.length).toBeGreaterThanOrEqual(3);

    // Risk analysis: a CRITICAL breach finding should push the score well above zero.
    expect(result.risk.exposureScore).toBeGreaterThan(0);
    expect(result.risk.counts.critical).toBeGreaterThanOrEqual(1);
    expect(result.risk.accountTakeoverRisk).toBeGreaterThan(0);

    // Identity correlation: two independent findings both mention employer "Acme Corp" —
    // the graph should have a single corroborated employer node, not two.
    const employerNodes = result.graph.nodes.filter((n) => n.type === "employer" && n.label === "Acme Corp");
    expect(employerNodes).toHaveLength(1);
    expect(employerNodes[0].confidence).not.toBe("UNKNOWN");

    // Social engineering analysis produced defensive-only guidance.
    expect(result.socialEngineering.every((i) => i.mitigation.length > 0)).toBe(true);

    // Remediation: every OPEN, non-source-unavailable finding got a remediation item.
    const remediation = db.listRemediation(investigation.id);
    expect(remediation.length).toBe(result.findings.filter((f) => f.exposureType !== "source_unavailable").length);

    // Source-unavailable handling: the blocked platform is recorded, never silently dropped or bypassed.
    expect(result.unavailable.some((u) => u.source === "mock_blocked_platform")).toBe(true);
  });

  it("does not duplicate findings on re-scan, and updates lastObservedAt instead", async () => {
    const investigation = newInvestigation("Rescan test", [{ type: "email", value: "alex.morgan@example.com" }]);
    db.createInvestigation(investigation);

    const first = await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: [mockSearchEngine] });
    expect(first.findings).toHaveLength(1);
    const firstSeenAt = first.findings[0].firstObservedAt;

    const second = await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: [mockSearchEngine] });
    expect(second.findings).toHaveLength(1); // still one, not two
    expect(second.findings[0].firstObservedAt).toBe(firstSeenAt); // first-seen date preserved
  });

  it("preserves a manually-set remediation status across re-scans", async () => {
    const investigation = newInvestigation("Remediation persistence test", [{ type: "email", value: "alex.morgan@example.com" }]);
    db.createInvestigation(investigation);

    const first = await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: [mockSearchEngine] });
    db.updateFindingStatus(first.findings[0].id, "VERIFIED_REMOVED");

    await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: [mockSearchEngine] });
    const findings = db.listFindings(investigation.id);
    expect(findings[0].status).toBe("VERIFIED_REMOVED");
  });

  it("continues the investigation even when one provider throws", async () => {
    const throwingProvider: OsintProvider = {
      name: "throwing",
      label: "Throwing Provider",
      module: "search_engine",
      requiresApiKey: false,
      isConfigured: () => true,
      supports: () => true,
      async search(): Promise<ProviderResult> {
        throw new Error("simulated provider crash");
      },
    };
    const investigation = newInvestigation("Resilience test", [{ type: "email", value: "alex.morgan@example.com" }]);
    db.createInvestigation(investigation);

    const result = await runInvestigation(db, investigation, DEFAULT_CONFIG, { providers: [throwingProvider, mockSearchEngine] });
    expect(result.findings).toHaveLength(1); // mockSearchEngine's finding still made it through
    expect(result.unavailable.some((u) => u.source === "throwing")).toBe(true);
  });
});

describe("helpers.validateFinding", () => {
  it("rejects a finding with a non-http(s) URL", () => {
    const seed: Seed = { id: "s1", investigationId: "inv", type: "email", value: "alex.morgan@example.com", addedAt: "2026-01-01T00:00:00.000Z" };
    const ctx: ProviderContext = { investigationId: "inv", config: DEFAULT_CONFIG, now: () => "2026-01-01T00:00:00.000Z" };
    const finding = normalizeFinding(
      {
        seed,
        module: "search_engine",
        source: "test",
        providerMode: "mock",
        url: "javascript:alert(1)",
        evidence: "test",
        exposureType: "email_exposed_publicly",
        riskLevel: "LOW",
        identityConfidence: "LOW",
        confidenceReason: "test",
      },
      ctx
    );
    expect(validateFinding(finding)).toBe(false);
  });
});

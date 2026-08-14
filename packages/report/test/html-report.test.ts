import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG, computeRiskScore, socialEngineeringAnalysis, type Finding, type Investigation } from "@dfi/core";
import { generateHtmlReport } from "../src/html-report";

const investigation: Investigation = {
  id: "inv_1",
  name: "Fictional Demo — Alex Morgan",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  seeds: [
    { id: "seed_email", investigationId: "inv_1", type: "email", value: "alex.morgan@example.com", addedAt: "2026-01-01T00:00:00.000Z" },
    { id: "seed_addr", investigationId: "inv_1", type: "address", value: "1 Example Way, Dublin", addedAt: "2026-01-01T00:00:00.000Z" },
  ],
};

const findings: Finding[] = [
  {
    id: "fnd_1",
    investigationId: "inv_1",
    seedId: "seed_email",
    identifierType: "email",
    identifierValue: "alex.morgan@example.com",
    module: "breach",
    source: "hibp",
    providerMode: "mock",
    title: "Breach: MockDataCo",
    evidence: "Found in simulated breach.",
    exposureType: "email_appears_in_breach",
    riskLevel: "CRITICAL",
    identityConfidence: "HIGH",
    confidenceReason: "Exact match",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    redacted: false,
    status: "OPEN",
    recommendedAction: "Change password and enable MFA.",
    dedupeKey: "k1",
  },
  {
    id: "fnd_2",
    investigationId: "inv_1",
    seedId: "seed_addr",
    identifierType: "address",
    identifierValue: "1 Example Way, Dublin",
    module: "address",
    source: "brave_search",
    providerMode: "mock",
    title: "Address indexed on a public directory",
    url: "https://directory.example.invalid/1-example-way",
    evidence: "Address found indexed publicly.",
    exposureType: "address_indexed_publicly",
    riskLevel: "HIGH",
    identityConfidence: "MEDIUM",
    confidenceReason: "Matched formatting",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    firstObservedAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    redacted: false,
    status: "OPEN",
    recommendedAction: "Submit an opt-out request to the directory.",
    dedupeKey: "k2",
  },
];

describe("generateHtmlReport", () => {
  const risk = computeRiskScore(findings, DEFAULT_CONFIG);
  const socialEngineering = socialEngineeringAnalysis(findings);
  const html = generateHtmlReport({ investigation, findings, risk, socialEngineering, generatedAt: "2026-01-02T00:00:00.000Z" });

  it("is well-formed HTML with a title referencing the investigation", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Fictional Demo — Alex Morgan");
  });

  it("includes the executive summary and only the sections with matching findings", () => {
    expect(html).toContain("Executive Summary");
    expect(html).toContain("Address Exposure");
    expect(html).toContain("Breach Exposure");
    expect(html).toContain("Recommended Actions");
    // No identity-category finding was supplied, so that section should be omitted, not printed empty.
    expect(html).not.toContain("Identity Exposure");
  });

  it("masks the raw email identifier rather than printing it verbatim in seed listing", () => {
    expect(html).not.toContain(">alex.morgan@example.com<");
  });

  it("reflects the computed risk score numerically", () => {
    expect(html).toContain(`>${risk.exposureScore}<`);
  });

  it("includes every finding's recommended action", () => {
    expect(html).toContain("Change password and enable MFA.");
    expect(html).toContain("Submit an opt-out request to the directory.");
  });
});

describe("generateHtmlReport XSS hardening", () => {
  it("escapes HTML special characters in a finding's title before embedding it", () => {
    const malicious: Finding = {
      ...findings[0],
      id: "fnd_xss",
      title: `<script>alert('xss')</script>`,
      evidence: `<img src=x onerror=alert(1)>`,
      dedupeKey: "k3",
    };
    const risk = computeRiskScore([malicious], DEFAULT_CONFIG);
    const html = generateHtmlReport({ investigation, findings: [malicious], risk, socialEngineering: [], generatedAt: "2026-01-02T00:00:00.000Z" });
    expect(html).not.toContain("<script>alert('xss')</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;script&gt;");
  });
});

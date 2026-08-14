import { newId, type ProviderContext, type ProviderResult, type RiskLevel, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const ALLOWED_HOSTS = ["haveibeenpwned.com"];
const SUPPORTED: SeedType[] = ["email"];

// Data classes HIBP may report that we treat as sensitive-but-safe-to-name categories.
// We NEVER retrieve or display passwords/hashes/tokens — HIBP's breach API itself never
// returns those; it only names the *categories* of data exposed in a breach.
const NEVER_DISPLAY = new Set(["Passwords", "Password Hints", "Auth Tokens", "Security Questions and Answers"]);

interface HibpBreach {
  Name: string;
  Title: string;
  BreachDate: string;
  DataClasses: string[];
  IsSensitive: boolean;
  IsVerified: boolean;
}

function severityFor(dataClasses: string[]): RiskLevel {
  const critical = ["Passwords", "Credit card details", "Bank account numbers", "Social security numbers", "Physical addresses"];
  const high = ["Auth Tokens", "Security questions and answers", "Phone numbers", "Partial credit card data"];
  if (dataClasses.some((d) => critical.includes(d))) return "CRITICAL";
  if (dataClasses.some((d) => high.includes(d))) return "HIGH";
  return "MEDIUM";
}

async function hibpLookup(email: string, config: ProviderContext["config"]): Promise<HibpBreach[]> {
  const apiKey = process.env.HIBP_API_KEY!;
  const res = await safeFetch(
    `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
    config,
    { allowedHosts: ALLOWED_HOSTS, headers: { "hibp-api-key": apiKey, Accept: "application/json" } }
  );
  if (res.status === 404) return []; // not found in any breach
  if (!res.ok) throw new SourceUnavailableError(`HIBP returned HTTP ${res.status}`, email);
  return JSON.parse(res.body) as HibpBreach[];
}

function mockLookup(email: string): HibpBreach[] {
  // Deterministic mock: emails containing "test" or the bundled fictional
  // demo identity get a simulated breach so the full pipeline is exercisable
  // without an API key. Everything else returns no breaches.
  const hash = [...email].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  if (!/test|demo|example/.test(email) || hash % 3 !== 0) return [];
  return [
    {
      Name: "MockDataCo",
      Title: "[MOCK] MockDataCo (simulated breach — configure HIBP_API_KEY for live data)",
      BreachDate: "2019-06-01",
      DataClasses: ["Email addresses", "Usernames", "Phone numbers"],
      IsSensitive: false,
      IsVerified: true,
    },
  ];
}

export const breachCheckerProvider: OsintProvider = {
  name: "hibp",
  label: "Have I Been Pwned (Module 12 — Data Breach Investigation)",
  module: "breach",
  requiresApiKey: true,
  isConfigured: () => Boolean(process.env.HIBP_API_KEY),
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const live = this.isConfigured();

    let breaches: HibpBreach[] = [];
    try {
      breaches = live ? await hibpLookup(seed.value, ctx.config) : mockLookup(seed.value);
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      result.unavailable.push({
        source: this.name,
        reason,
        url: "https://haveibeenpwned.com/",
        recommendedManualVerification: `Manually check ${seed.value} at https://haveibeenpwned.com/`,
      });
      result.logEntries.push({
        id: newId("log"),
        investigationId: ctx.investigationId,
        timestamp: ctx.now(),
        query: seed.value,
        source: this.name,
        result: `Source unavailable: ${reason}`,
        identifierSearched: seed.value,
        module: this.module,
        confidence: "UNKNOWN",
      });
      return result;
    }

    result.logEntries.push({
      id: newId("log"),
      investigationId: ctx.investigationId,
      timestamp: ctx.now(),
      query: seed.value,
      source: this.name,
      httpStatus: 200,
      result: `${breaches.length} breach(es) found (${live ? "live" : "mock"})`,
      identifierSearched: seed.value,
      module: this.module,
      confidence: breaches.length > 0 ? "HIGH" : "MEDIUM",
    });

    for (const b of breaches) {
      const safeDataClasses = b.DataClasses.map((d) => (NEVER_DISPLAY.has(d) ? `${d} (category only — value never retrieved)` : d));
      const finding = normalizeFinding(
        {
          seed,
          module: "breach",
          source: this.name,
          providerMode: live ? "live" : "mock",
          platform: b.Title,
          title: `Breach: ${b.Title}`,
          evidence: `"${seed.value}" appears in the reported breach "${b.Title}" (${b.BreachDate}). Exposed data categories: ${safeDataClasses.join(", ")}.`,
          exposureType: "email_appears_in_breach",
          riskLevel: severityFor(b.DataClasses),
          identityConfidence: "HIGH",
          confidenceReason: "Exact email match reported by a breach-notification service.",
          metadata: { breachName: b.Name, breachDate: b.BreachDate, dataClasses: safeDataClasses, verified: b.IsVerified },
          recommendedAction: "Change the password on this and any service where it was reused; enable MFA; monitor for suspicious activity.",
        },
        ctx
      );
      if (validateFinding(finding)) result.findings.push(finding);
    }
    return result;
  },
};

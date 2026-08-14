import {
  generateQueriesForSeed,
  newId,
  type ExposureType,
  type ProviderContext,
  type ProviderResult,
  type Seed,
  type SeedType,
} from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const ALLOWED_HOSTS = ["api.search.brave.com"];
const SUPPORTED: SeedType[] = ["email", "phone", "name", "username", "address"];

interface BraveResult {
  title: string;
  url: string;
  description?: string;
}

function exposureTypeFor(seedType: SeedType, query: string): ExposureType {
  if (seedType === "email") {
    if (query.includes("filetype:")) return "email_appears_in_document";
    if (query.includes("account")) return "email_associated_with_account";
    return "email_exposed_publicly";
  }
  if (seedType === "phone") return "phone_exposed_publicly";
  if (seedType === "address") return "address_indexed_publicly";
  if (seedType === "username") return "username_match";
  return "name_match";
}

async function braveSearch(query: string, config: ProviderContext["config"]): Promise<BraveResult[]> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  const res = await safeFetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, config, {
    allowedHosts: ALLOWED_HOSTS,
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey! },
  });
  if (!res.ok) throw new SourceUnavailableError(`Brave Search returned HTTP ${res.status}`, query);
  const json = JSON.parse(res.body);
  const results = (json?.web?.results ?? []) as any[];
  return results.map((r) => ({ title: r.title, url: r.url, description: r.description }));
}

function mockSearch(seed: Seed, query: string): BraveResult[] {
  // Deterministic, clearly-fictional mock results so users can exercise the full
  // pipeline (correlation/risk/report) before configuring a real API key.
  if (query.includes("filetype:")) return [];
  const base = seed.value.replace(/\s+/g, "-").toLowerCase();
  return [
    {
      title: `[MOCK] Public mention matching "${seed.value}"`,
      url: `https://example-directory.invalid/profile/${encodeURIComponent(base)}`,
      description: `[MOCK DATA] Simulated public listing referencing "${seed.value}". Configure BRAVE_SEARCH_API_KEY for live results.`,
    },
  ];
}

export const searchEngineProvider: OsintProvider = {
  name: "brave_search",
  label: "Brave Search (Module A — Search Engine Intelligence)",
  module: "search_engine",
  requiresApiKey: true,
  isConfigured: () => Boolean(process.env.BRAVE_SEARCH_API_KEY),
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const queries = generateQueriesForSeed(seed);
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const live = this.isConfigured();

    for (const gq of queries) {
      let results: BraveResult[] = [];
      let httpStatus: number | undefined;
      try {
        results = live ? await braveSearch(gq.query, ctx.config) : mockSearch(seed, gq.query);
        httpStatus = live ? 200 : undefined;
      } catch (err) {
        const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
        result.unavailable.push({
          source: this.name,
          reason,
          url: `https://search.brave.com/search?q=${encodeURIComponent(gq.query)}`,
          recommendedManualVerification: `Manually run the query "${gq.query}" in a search engine and review results.`,
        });
        result.logEntries.push({
          id: newId("log"),
          investigationId: ctx.investigationId,
          timestamp: ctx.now(),
          query: gq.query,
          source: this.name,
          result: `Source unavailable: ${reason}`,
          identifierSearched: seed.value,
          module: this.module,
          confidence: "UNKNOWN",
        });
        continue;
      }

      result.logEntries.push({
        id: newId("log"),
        investigationId: ctx.investigationId,
        timestamp: ctx.now(),
        query: gq.query,
        source: this.name,
        httpStatus,
        result: `${results.length} result(s) (${live ? "live" : "mock"})`,
        identifierSearched: seed.value,
        module: this.module,
        confidence: results.length > 0 ? "MEDIUM" : "UNKNOWN",
      });

      for (const r of results) {
        const finding = normalizeFinding(
          {
            seed,
            module: "search_engine",
            source: this.name,
            providerMode: live ? "live" : "mock",
            title: r.title,
            url: r.url,
            snippet: r.description,
            evidence: `Query "${gq.query}" (${gq.purpose}) returned: ${r.title}`,
            exposureType: exposureTypeFor(seed.type, gq.query),
            riskLevel: seed.type === "address" ? "HIGH" : "MEDIUM",
            identityConfidence: "LOW",
            confidenceReason: "Name-only or single-source search match; not yet corroborated by another source.",
            metadata: { query: gq.query, purpose: gq.purpose },
          },
          ctx
        );
        if (validateFinding(finding)) result.findings.push(finding);
      }
    }
    return result;
  },
};

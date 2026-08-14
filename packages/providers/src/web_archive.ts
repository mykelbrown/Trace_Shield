import { newId, type ProviderContext, type ProviderResult, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const ALLOWED_HOSTS = ["web.archive.org"];
const SUPPORTED: SeedType[] = ["domain", "social_profile"];

// CDX row shape when output=json: [urlkey, timestamp, original, mimetype, statuscode, digest, length]
type CdxRow = [string, string, string, string, string, string, string];

export const webArchiveProvider: OsintProvider = {
  name: "wayback_machine",
  label: "Internet Archive Wayback Machine (Module 16 — Historical Footprint)",
  module: "archive",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const target = seed.type === "domain" ? `${seed.value}*` : seed.value;
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(target)}&output=json&collapse=urlkey&limit=25&filter=statuscode:200`;

    try {
      const res = await safeFetch(cdxUrl, ctx.config, { allowedHosts: ALLOWED_HOSTS, headers: { Accept: "application/json" } });
      if (!res.ok) throw new SourceUnavailableError(`Wayback CDX API returned HTTP ${res.status}`, target);

      const rows = JSON.parse(res.body || "[]") as (string[] | CdxRow)[];
      const snapshots = rows.slice(1) as CdxRow[]; // first row is the header

      result.logEntries.push({
        id: newId("log"),
        investigationId: ctx.investigationId,
        timestamp: ctx.now(),
        query: cdxUrl,
        source: this.name,
        httpStatus: 200,
        result: `${snapshots.length} archived snapshot(s)`,
        identifierSearched: seed.value,
        module: this.module,
        confidence: snapshots.length > 0 ? "HIGH" : "UNKNOWN",
      });

      if (snapshots.length > 0) {
        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];
        const finding = normalizeFinding(
          {
            seed,
            module: "archive",
            source: this.name,
            providerMode: "live",
            title: `${snapshots.length} archived snapshot(s) found`,
            url: `https://web.archive.org/web/${last[1]}/${last[2]}`,
            evidence: `The Wayback Machine holds ${snapshots.length} snapshot(s) of ${seed.type === "domain" ? "pages on" : ""} ${seed.value}, spanning ${first[1].slice(0, 4)}–${last[1].slice(0, 4)}.`,
            exposureType: "historical_archive",
            riskLevel: "LOW",
            identityConfidence: seed.type === "social_profile" ? "HIGH" : "MEDIUM",
            confidenceReason: "Directly observed in the Internet Archive's public CDX index.",
            metadata: {
              snapshotCount: snapshots.length,
              firstSnapshot: first[1],
              lastSnapshot: last[1],
              sampleUrls: snapshots.slice(0, 10).map((r) => `https://web.archive.org/web/${r[1]}/${r[2]}`),
            },
          },
          ctx
        );
        if (validateFinding(finding)) result.findings.push(finding);
      }
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      result.unavailable.push({
        source: this.name,
        reason,
        url: `https://web.archive.org/web/*/${target}`,
        recommendedManualVerification: `Manually browse https://web.archive.org/web/*/${target}`,
      });
    }

    return result;
  },
};

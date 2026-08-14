import { newId, type ProviderContext, type ProviderResult, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const ALLOWED_HOSTS = ["crt.sh"];
const SUPPORTED: SeedType[] = ["domain"];

interface CrtShEntry {
  name_value: string;
  not_before: string;
  issuer_name: string;
}

export const certificateTransparencyProvider: OsintProvider = {
  name: "crt.sh",
  label: "crt.sh Certificate Transparency (Module 14 — Subdomain Discovery)",
  module: "dns",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const domain = seed.value;

    try {
      const res = await safeFetch(`https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`, ctx.config, {
        allowedHosts: ALLOWED_HOSTS,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new SourceUnavailableError(`crt.sh returned HTTP ${res.status}`, domain);

      const entries = JSON.parse(res.body || "[]") as CrtShEntry[];
      const subdomains = new Set<string>();
      for (const e of entries) {
        for (const name of e.name_value.split("\n")) {
          const clean = name.trim().toLowerCase();
          if (clean.endsWith(domain.toLowerCase()) && clean !== domain.toLowerCase() && !clean.startsWith("*.")) {
            subdomains.add(clean);
          }
        }
      }

      result.logEntries.push({
        id: newId("log"),
        investigationId: ctx.investigationId,
        timestamp: ctx.now(),
        query: `crt.sh %.${domain}`,
        source: this.name,
        httpStatus: 200,
        result: `${subdomains.size} unique subdomain(s) from ${entries.length} certificate(s)`,
        identifierSearched: domain,
        module: this.module,
        confidence: "HIGH",
      });

      if (subdomains.size > 0) {
        const finding = normalizeFinding(
          {
            seed,
            module: "dns",
            source: this.name,
            providerMode: "live",
            title: `${subdomains.size} subdomain(s) discovered via certificate transparency`,
            url: `https://crt.sh/?q=%25.${domain}`,
            evidence: `Certificate transparency logs reveal ${subdomains.size} publicly issued TLS certificate(s) for subdomains of ${domain}.`,
            exposureType: "subdomain_exposure",
            riskLevel: subdomains.size > 15 ? "MEDIUM" : "LOW",
            identityConfidence: "HIGH",
            confidenceReason: "Directly observed in public Certificate Transparency logs (immutable, append-only).",
            metadata: { subdomains: [...subdomains].slice(0, 50), totalCertificates: entries.length },
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
        url: `https://crt.sh/?q=%25.${domain}`,
        recommendedManualVerification: `Manually browse https://crt.sh/?q=%25.${domain}`,
      });
    }

    return result;
  },
};

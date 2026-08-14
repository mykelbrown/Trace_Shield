import dns from "node:dns/promises";
import { newId, type ProviderContext, type ProviderResult, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const SUPPORTED: SeedType[] = ["domain"];
const ALLOWED_HOSTS = ["rdap.org"];

async function safeResolve<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

export const dnsProvider: OsintProvider = {
  name: "dns_public_records",
  label: "Public DNS / RDAP (Module 14 — Domain & DNS Footprint)",
  module: "dns",
  requiresApiKey: false,
  isConfigured: () => true, // DNS resolution and RDAP are public, no key required
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const domain = seed.value;

    const [mx, txt, ns, a, aaaa, dmarc] = await Promise.all([
      safeResolve(() => dns.resolveMx(domain)),
      safeResolve(() => dns.resolveTxt(domain)),
      safeResolve(() => dns.resolveNs(domain)),
      safeResolve(() => dns.resolve4(domain)),
      safeResolve(() => dns.resolve6(domain)),
      safeResolve(() => dns.resolveTxt(`_dmarc.${domain}`)),
    ]);

    const flatTxt = (txt ?? []).map((parts) => parts.join(""));
    const spf = flatTxt.find((t) => t.startsWith("v=spf1"));
    const dmarcRecord = (dmarc ?? []).map((p) => p.join("")).find((t) => t.startsWith("v=DMARC1"));

    result.logEntries.push({
      id: newId("log"),
      investigationId: ctx.investigationId,
      timestamp: ctx.now(),
      query: `DNS: MX/TXT/NS/A/AAAA/_dmarc for ${domain}`,
      source: this.name,
      result: `MX:${mx?.length ?? 0} TXT:${txt?.length ?? 0} NS:${ns?.length ?? 0} A:${a?.length ?? 0} AAAA:${aaaa?.length ?? 0} DMARC:${dmarcRecord ? 1 : 0}`,
      identifierSearched: domain,
      module: this.module,
      confidence: "HIGH",
    });

    if (mx?.length || txt?.length || ns?.length || a?.length) {
      const finding = normalizeFinding(
        {
          seed,
          module: "dns",
          source: this.name,
          providerMode: "live",
          title: `DNS footprint for ${domain}`,
          evidence: `Publicly resolvable DNS records for ${domain}: ${mx?.length ?? 0} MX, ${ns?.length ?? 0} NS, ${a?.length ?? 0} A, ${aaaa?.length ?? 0} AAAA, SPF ${spf ? "present" : "absent"}, DMARC ${dmarcRecord ? "present" : "absent"}.`,
          exposureType: "domain_dns_exposure",
          riskLevel: dmarcRecord && spf ? "LOW" : "MEDIUM",
          identityConfidence: "HIGH",
          confidenceReason: "Directly resolved from authoritative public DNS.",
          metadata: {
            mx: mx?.map((r) => r.exchange) ?? [],
            nameServers: ns ?? [],
            a: a ?? [],
            aaaa: aaaa ?? [],
            spf: spf ?? null,
            dmarc: dmarcRecord ?? null,
            spamProtection: spf && dmarcRecord ? "SPF + DMARC configured" : "Missing SPF and/or DMARC — domain more susceptible to spoofing",
          },
          recommendedAction: spf && dmarcRecord ? undefined : "Configure SPF and DMARC TXT records to reduce email-spoofing risk against this domain.",
        },
        ctx
      );
      if (validateFinding(finding)) result.findings.push(finding);
    }

    // RDAP (modern WHOIS replacement) — free, no key required.
    try {
      const res = await safeFetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, ctx.config, {
        allowedHosts: ALLOWED_HOSTS,
        headers: { Accept: "application/rdap+json" },
      });
      if (res.ok) {
        const json = JSON.parse(res.body);
        const registrar = (json.entities ?? []).find((e: any) => e.roles?.includes("registrar"));
        const events = json.events ?? [];
        const registration = events.find((e: any) => e.eventAction === "registration")?.eventDate;
        const finding = normalizeFinding(
          {
            seed,
            module: "dns",
            source: "rdap",
            providerMode: "live",
            title: `RDAP/WHOIS record for ${domain}`,
            url: `https://rdap.org/domain/${domain}`,
            evidence: `Public RDAP record found for ${domain}${registration ? `, registered ${registration}` : ""}.`,
            exposureType: "domain_dns_exposure",
            riskLevel: "LOW",
            identityConfidence: "HIGH",
            confidenceReason: "Directly retrieved from the domain's public RDAP record.",
            metadata: { registrar: registrar?.vcardArray?.[1]?.find((v: any) => v[0] === "fn")?.[3] ?? undefined, registrationDate: registration ?? null, status: json.status ?? [] },
          },
          ctx
        );
        if (validateFinding(finding)) result.findings.push(finding);
      } else {
        result.unavailable.push({
          source: "rdap",
          reason: `RDAP lookup returned HTTP ${res.status}`,
          url: `https://rdap.org/domain/${domain}`,
          recommendedManualVerification: `Run \`whois ${domain}\` or check https://rdap.org/domain/${domain}`,
        });
      }
    } catch (err) {
      const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
      result.unavailable.push({
        source: "rdap",
        reason,
        url: `https://rdap.org/domain/${domain}`,
        recommendedManualVerification: `Run \`whois ${domain}\` manually`,
      });
    }

    return result;
  },
};

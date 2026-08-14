import type { ExposureType, Finding, Investigation, RiskScore, SocialEngineeringInsight } from "@dfi/core";
import { maskIdentifier } from "@dfi/core";

export interface ReportData {
  investigation: Investigation;
  findings: Finding[];
  risk: RiskScore;
  socialEngineering: SocialEngineeringInsight[];
  generatedAt: string;
}

type SectionKey =
  | "identity"
  | "social"
  | "professional"
  | "address"
  | "breach"
  | "documents"
  | "technical"
  | "other";

const SECTION_FOR: Record<ExposureType, SectionKey> = {
  email_exposed_publicly: "identity",
  email_associated_with_account: "identity",
  email_associated_with_business: "professional",
  email_appears_in_document: "documents",
  email_appears_in_breach: "breach",
  email_historical_result: "identity",
  phone_exposed_publicly: "identity",
  phone_business_association: "professional",
  address_indexed_publicly: "address",
  name_match: "identity",
  username_match: "identity",
  social_profile: "social",
  professional_profile: "professional",
  document_exposure: "documents",
  breach_exposure: "breach",
  code_repository_exposure: "technical",
  potential_secret: "technical",
  domain_dns_exposure: "technical",
  subdomain_exposure: "technical",
  historical_archive: "other",
  source_unavailable: "other",
};

const SECTION_TITLES: Record<SectionKey, string> = {
  identity: "Identity Exposure",
  social: "Social Media Exposure",
  professional: "Professional Exposure",
  address: "Address Exposure",
  breach: "Breach Exposure",
  documents: "Document Exposure",
  technical: "Code / Technical Exposure",
  other: "Other Findings",
};

const RISK_COLOR: Record<Finding["riskLevel"], string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#d97706",
  LOW: "#65a30d",
};

function esc(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function findingRow(f: Finding): string {
  const identifier = f.redacted ? f.identifierValue : maskIdentifier(f.identifierValue, f.identifierType);
  return `
  <tr>
    <td><span class="badge" style="background:${RISK_COLOR[f.riskLevel]}">${f.riskLevel}</span></td>
    <td>${esc(f.title ?? f.exposureType.replace(/_/g, " "))}</td>
    <td>${esc(f.platform ?? f.source)}</td>
    <td>${esc(identifier)}</td>
    <td>${f.identityConfidence}</td>
    <td>${f.url ? `<a href="${esc(f.url)}">${esc(f.url.slice(0, 60))}${f.url.length > 60 ? "…" : ""}</a>` : "—"}</td>
    <td>${esc(f.recommendedAction)}</td>
  </tr>`;
}

function section(key: SectionKey, findings: Finding[]): string {
  const rows = findings.filter((f) => SECTION_FOR[f.exposureType] === key);
  if (rows.length === 0) return "";
  return `
  <section class="report-section">
    <h2>${SECTION_TITLES[key]} <span class="count">${rows.length}</span></h2>
    <table>
      <thead><tr><th>Risk</th><th>Finding</th><th>Source</th><th>Identifier</th><th>Confidence</th><th>URL</th><th>Recommended Action</th></tr></thead>
      <tbody>${rows.map(findingRow).join("")}</tbody>
    </table>
  </section>`;
}

function scoreGauge(label: string, value: number): string {
  const color = value >= 70 ? "#dc2626" : value >= 40 ? "#ea580c" : value >= 15 ? "#d97706" : "#65a30d";
  return `
  <div class="gauge">
    <div class="gauge-value" style="color:${color}">${value}</div>
    <div class="gauge-label">${label}</div>
  </div>`;
}

export function generateHtmlReport(data: ReportData): string {
  const { investigation, findings, risk, socialEngineering, generatedAt } = data;

  const seInsights = socialEngineering
    .map(
      (i) => `
    <div class="insight">
      <h4>${esc(i.potentialAttack)}</h4>
      <p><strong>An attacker could determine:</strong> ${i.attackerCanDetermine.map(esc).join(", ")}</p>
      <p><strong>Why it matters:</strong> ${esc(i.why)}</p>
      <p><strong>Recommended mitigations:</strong></p>
      <ul>${i.mitigation.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
    </div>`
    )
    .join("");

  const sections: SectionKey[] = ["identity", "social", "professional", "address", "breach", "documents", "technical", "other"];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Digital Footprint Intelligence Report — ${esc(investigation.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 2.5rem; color: #1a1a2e; background: #ffffff; line-height: 1.5; }
  h1 { font-size: 1.8rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.4rem; margin-top: 2.5rem; }
  .subtitle { color: #64748b; margin-bottom: 2rem; }
  .exec-summary { display: flex; gap: 1rem; flex-wrap: wrap; margin: 1.5rem 0 2.5rem; }
  .gauge { border: 1px solid #e2e8f0; border-radius: 12px; padding: 1rem 1.25rem; min-width: 140px; text-align: center; background: #f8fafc; }
  .gauge-value { font-size: 2rem; font-weight: 700; }
  .gauge-label { font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
  .count-row { display: flex; gap: 0.75rem; margin-bottom: 2rem; }
  .count-chip { border-radius: 999px; padding: 0.35rem 0.9rem; font-size: 0.85rem; font-weight: 600; color: white; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.75rem; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid #eef1f5; vertical-align: top; }
  th { background: #f8fafc; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
  .badge { color: white; padding: 0.15rem 0.5rem; border-radius: 6px; font-size: 0.7rem; font-weight: 700; }
  .count { font-size: 0.9rem; color: #94a3b8; font-weight: 400; }
  .insight { border: 1px solid #e2e8f0; border-radius: 10px; padding: 1rem 1.25rem; margin: 1rem 0; background: #fffbeb; }
  .insight h4 { margin: 0 0 0.5rem; }
  .meta-table td:first-child { font-weight: 600; width: 220px; color: #475569; }
  footer { margin-top: 3rem; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #eef1f5; padding-top: 1rem; }
  @media print { body { padding: 1rem; } .gauge { break-inside: avoid; } table { break-inside: avoid; } }
</style>
</head>
<body>
  <h1>Digital Footprint Intelligence Report</h1>
  <div class="subtitle">Investigation: ${esc(investigation.name)} · Generated ${esc(generatedAt)}</div>

  <h2>Executive Summary</h2>
  <div class="exec-summary">
    ${scoreGauge("Overall Exposure", risk.exposureScore)}
    ${scoreGauge("Identity Risk", risk.identityRisk)}
    ${scoreGauge("Privacy Risk", risk.privacyRisk)}
    ${scoreGauge("Social Engineering Risk", risk.socialEngineeringRisk)}
    ${scoreGauge("Account Takeover Risk", risk.accountTakeoverRisk)}
    ${scoreGauge("Reputation Risk", risk.reputationRisk)}
  </div>
  <div class="count-row">
    <span class="count-chip" style="background:${RISK_COLOR.CRITICAL}">Critical: ${risk.counts.critical}</span>
    <span class="count-chip" style="background:${RISK_COLOR.HIGH}">High: ${risk.counts.high}</span>
    <span class="count-chip" style="background:${RISK_COLOR.MEDIUM}">Medium: ${risk.counts.medium}</span>
    <span class="count-chip" style="background:${RISK_COLOR.LOW}">Low: ${risk.counts.low}</span>
  </div>

  <h2>Investigation Seeds</h2>
  <table class="meta-table">
    <tbody>
      ${investigation.seeds.map((s) => `<tr><td>${esc(s.type)}${s.label ? ` (${esc(s.label)})` : ""}</td><td>${esc(s.type === "email" || s.type === "phone" ? maskIdentifier(s.value, s.type) : s.value)}</td></tr>`).join("")}
    </tbody>
  </table>

  ${sections.map((s) => section(s, findings)).join("")}

  <h2>Social Engineering Risk Analysis</h2>
  ${seInsights || "<p>No significant social-engineering attack surface identified from current findings.</p>"}

  <h2>Recommended Actions (Prioritized)</h2>
  <table>
    <thead><tr><th>Priority</th><th>Finding</th><th>Recommended Action</th></tr></thead>
    <tbody>
      ${[...findings]
        .filter((f) => f.status === "OPEN" && f.exposureType !== "source_unavailable")
        .sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel))
        .slice(0, 25)
        .map((f) => `<tr><td><span class="badge" style="background:${RISK_COLOR[f.riskLevel]}">${f.riskLevel}</span></td><td>${esc(f.title ?? f.exposureType)}</td><td>${esc(f.recommendedAction)}</td></tr>`)
        .join("")}
    </tbody>
  </table>

  <footer>
    Generated locally by Digital Footprint Intelligence (DFI). This report reflects publicly accessible information at
    the time of the scan; identity-confidence ratings indicate how certain the correlation is, not certainty of fact.
    This is a self-audit artifact — treat it as sensitive and store/share it accordingly.
  </footer>
</body>
</html>`;
}

function riskRank(r: Finding["riskLevel"]): number {
  return { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 }[r];
}

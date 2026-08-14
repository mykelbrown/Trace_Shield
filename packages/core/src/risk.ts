import type { ConfidenceLevel, DfiConfig, ExposureType, Finding, RiskScore } from "./types";

const CONFIDENCE_MULTIPLIER: Record<ConfidenceLevel, number> = {
  HIGH: 1.0,
  MEDIUM: 0.7,
  LOW: 0.4,
  UNKNOWN: 0.2,
};

/**
 * How much each exposure type contributes to each risk dimension, 0..1.
 * Tuned qualitatively per the platform spec (section 18/19) — e.g. a home
 * address indexed publicly weighs heavily on Privacy Risk but lightly on
 * Account Takeover Risk, while a breach exposure weighs heavily on Account
 * Takeover Risk.
 */
const DIMENSION_WEIGHTS: Record<ExposureType, { identity: number; privacy: number; socialEngineering: number; accountTakeover: number; reputation: number }> = {
  email_exposed_publicly: { identity: 0.6, privacy: 0.3, socialEngineering: 0.5, accountTakeover: 0.3, reputation: 0.1 },
  email_associated_with_account: { identity: 0.5, privacy: 0.2, socialEngineering: 0.4, accountTakeover: 0.5, reputation: 0.1 },
  email_associated_with_business: { identity: 0.4, privacy: 0.1, socialEngineering: 0.5, accountTakeover: 0.1, reputation: 0.2 },
  email_appears_in_document: { identity: 0.5, privacy: 0.4, socialEngineering: 0.3, accountTakeover: 0.2, reputation: 0.2 },
  email_appears_in_breach: { identity: 0.6, privacy: 0.3, socialEngineering: 0.4, accountTakeover: 0.9, reputation: 0.3 },
  email_historical_result: { identity: 0.3, privacy: 0.2, socialEngineering: 0.2, accountTakeover: 0.2, reputation: 0.3 },
  phone_exposed_publicly: { identity: 0.5, privacy: 0.6, socialEngineering: 0.5, accountTakeover: 0.3, reputation: 0.1 },
  phone_business_association: { identity: 0.3, privacy: 0.3, socialEngineering: 0.4, accountTakeover: 0.1, reputation: 0.1 },
  address_indexed_publicly: { identity: 0.4, privacy: 0.9, socialEngineering: 0.6, accountTakeover: 0.1, reputation: 0.1 },
  name_match: { identity: 0.3, privacy: 0.1, socialEngineering: 0.2, accountTakeover: 0.05, reputation: 0.1 },
  username_match: { identity: 0.4, privacy: 0.2, socialEngineering: 0.3, accountTakeover: 0.4, reputation: 0.2 },
  social_profile: { identity: 0.4, privacy: 0.3, socialEngineering: 0.6, accountTakeover: 0.3, reputation: 0.3 },
  professional_profile: { identity: 0.3, privacy: 0.1, socialEngineering: 0.6, accountTakeover: 0.1, reputation: 0.2 },
  document_exposure: { identity: 0.4, privacy: 0.4, socialEngineering: 0.3, accountTakeover: 0.2, reputation: 0.2 },
  breach_exposure: { identity: 0.6, privacy: 0.3, socialEngineering: 0.4, accountTakeover: 0.9, reputation: 0.4 },
  code_repository_exposure: { identity: 0.3, privacy: 0.1, socialEngineering: 0.2, accountTakeover: 0.3, reputation: 0.2 },
  potential_secret: { identity: 0.2, privacy: 0.1, socialEngineering: 0.1, accountTakeover: 1.0, reputation: 0.3 },
  domain_dns_exposure: { identity: 0.1, privacy: 0.1, socialEngineering: 0.2, accountTakeover: 0.2, reputation: 0.1 },
  subdomain_exposure: { identity: 0.1, privacy: 0.1, socialEngineering: 0.2, accountTakeover: 0.3, reputation: 0.1 },
  historical_archive: { identity: 0.2, privacy: 0.2, socialEngineering: 0.2, accountTakeover: 0.1, reputation: 0.3 },
  source_unavailable: { identity: 0, privacy: 0, socialEngineering: 0, accountTakeover: 0, reputation: 0 },
};

/** Saturating curve so score approaches but never reaches 100 with a linear sum of contributions. */
function saturate(total: number, k: number): number {
  return Math.round(100 * (1 - Math.exp(-total / k)));
}

export function computeRiskScore(findings: Finding[], config: DfiConfig): RiskScore {
  const weights = config.risk.weights;
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };

  let overallTotal = 0;
  const dims = { identity: 0, privacy: 0, socialEngineering: 0, accountTakeover: 0, reputation: 0 };

  for (const f of findings) {
    if (f.exposureType === "source_unavailable") continue;
    counts[f.riskLevel.toLowerCase() as "critical" | "high" | "medium" | "low"]++;

    const base = weights[f.riskLevel.toLowerCase() as "critical" | "high" | "medium" | "low"];
    const confidence = CONFIDENCE_MULTIPLIER[f.identityConfidence];
    const contribution = base * confidence;
    overallTotal += contribution;

    const dimWeights = DIMENSION_WEIGHTS[f.exposureType];
    dims.identity += contribution * dimWeights.identity;
    dims.privacy += contribution * dimWeights.privacy;
    dims.socialEngineering += contribution * dimWeights.socialEngineering;
    dims.accountTakeover += contribution * dimWeights.accountTakeover;
    dims.reputation += contribution * dimWeights.reputation;
  }

  return {
    exposureScore: saturate(overallTotal, 60),
    identityRisk: saturate(dims.identity, 35),
    privacyRisk: saturate(dims.privacy, 35),
    socialEngineeringRisk: saturate(dims.socialEngineering, 35),
    accountTakeoverRisk: saturate(dims.accountTakeover, 35),
    reputationRisk: saturate(dims.reputation, 35),
    counts,
  };
}

/** Human-readable, defensive-only social engineering analysis (no attack instructions). */
export interface SocialEngineeringInsight {
  attackerCanDetermine: string[];
  potentialAttack: string;
  why: string;
  mitigation: string[];
}

export function socialEngineeringAnalysis(findings: Finding[]): SocialEngineeringInsight[] {
  const insights: SocialEngineeringInsight[] = [];
  const byType = new Set(findings.map((f) => f.exposureType));

  const known = (label: string, types: ExposureType[]) =>
    types.some((t) => byType.has(t)) ? label : undefined;

  const attackerCanDetermine = [
    known("Full name", ["name_match"]),
    known("Email address", ["email_exposed_publicly", "email_associated_with_account"]),
    known("Employer / job role", ["professional_profile", "email_associated_with_business"]),
    known("Phone number", ["phone_exposed_publicly"]),
    known("Home address", ["address_indexed_publicly"]),
    known("Social media presence", ["social_profile"]),
    known("Historical / former accounts", ["email_historical_result", "historical_archive"]),
  ].filter((v): v is string => Boolean(v));

  if (attackerCanDetermine.length === 0) return insights;

  if (byType.has("email_exposed_publicly") && byType.has("professional_profile")) {
    insights.push({
      attackerCanDetermine,
      potentialAttack: "Highly targeted (spear) phishing",
      why: "An attacker can combine a real employer, job role, and a working email address to craft a convincing, personalized phishing pretext (e.g., impersonating IT, a vendor, or a colleague).",
      mitigation: [
        "Enable MFA (preferably hardware key or authenticator app) on email and business accounts",
        "Reduce public employer/role detail on social profiles where not professionally required",
        "Treat unexpected requests referencing your employer/role with extra scrutiny",
      ],
    });
  }

  if (byType.has("breach_exposure") || byType.has("email_appears_in_breach")) {
    insights.push({
      attackerCanDetermine: [...attackerCanDetermine, "Presence in a known data breach"],
      potentialAttack: "Credential-stuffing / account takeover attempts",
      why: "Breach exposure suggests this email may be tied to reused credentials on other services.",
      mitigation: ["Change any reused passwords", "Enable MFA everywhere available", "Use a password manager with unique passwords per site"],
    });
  }

  if (byType.has("address_indexed_publicly") && (byType.has("phone_exposed_publicly") || byType.has("email_exposed_publicly"))) {
    insights.push({
      attackerCanDetermine: [...attackerCanDetermine, "Home address correlated with contact details"],
      potentialAttack: "Impersonation, targeted social engineering, or physical-security risk",
      why: "Address + contact-detail correlation increases the credibility of impersonation attempts (e.g., fake delivery, fake official contact) and physical targeting risk.",
      mitigation: ["Request removal from people-search/data-broker sites indexing the address", "Avoid posting home address publicly", "Review shipping/public-facing business registrations for address exposure"],
    });
  }

  return insights;
}

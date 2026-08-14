import {
  computeDedupeKey,
  newId,
  recommendedActionFor,
  redactSecrets,
  type ConfidenceLevel,
  type ExposureType,
  type Finding,
  type InvestigationModule,
  type ProviderContext,
  type RiskLevel,
  type Seed,
  type SourceUnavailable,
} from "@dfi/core";

export interface FindingInput {
  seed: Seed;
  module: InvestigationModule;
  source: string;
  providerMode: "live" | "mock" | "manual";
  platform?: string;
  title?: string;
  url?: string;
  snippet?: string;
  evidence: string;
  exposureType: ExposureType;
  riskLevel: RiskLevel;
  identityConfidence: ConfidenceLevel;
  confidenceReason: string;
  metadata?: Record<string, unknown>;
  recommendedAction?: string;
}

/**
 * normalize(): builds a well-formed Finding from raw provider input, applying
 * the platform-wide redaction pass (section 13/25 "normalize/validate/score").
 */
export function normalizeFinding(input: FindingInput, ctx: ProviderContext): Finding {
  const now = ctx.now();
  const { redacted: safeSnippet, found } = redactSecrets(input.snippet ?? "");
  const { redacted: safeEvidence } = redactSecrets(input.evidence);

  const finding: Finding = {
    id: newId("fnd"),
    investigationId: ctx.investigationId,
    seedId: input.seed.id,
    identifierType: input.seed.type,
    identifierValue: input.seed.value,
    module: input.module,
    source: input.source,
    providerMode: input.providerMode,
    platform: input.platform,
    title: input.title,
    url: input.url,
    snippet: safeSnippet,
    evidence: safeEvidence,
    exposureType: input.exposureType,
    // A detected secret always escalates risk to CRITICAL regardless of the caller's guess.
    riskLevel: found.length > 0 ? "CRITICAL" : input.riskLevel,
    identityConfidence: input.identityConfidence,
    confidenceReason: input.confidenceReason,
    discoveredAt: now,
    firstObservedAt: now,
    lastObservedAt: now,
    metadata: input.metadata ?? {},
    redacted: found.length > 0,
    status: "OPEN",
    recommendedAction: input.recommendedAction ?? recommendedActionFor(input.exposureType),
    dedupeKey: "",
  };
  finding.dedupeKey = computeDedupeKey(finding);
  return finding;
}

/** validate(): a finding is only kept if it has the minimum evidence needed to act on it. */
export function validateFinding(f: Finding): boolean {
  if (!f.evidence || f.evidence.trim().length === 0) return false;
  if (!f.identifierValue) return false;
  if (f.url && !/^https?:\/\//.test(f.url)) return false;
  return true;
}

export function sourceUnavailable(source: string, reason: string, url: string | undefined, manual: string): SourceUnavailable {
  return { source, reason, url, recommendedManualVerification: manual };
}

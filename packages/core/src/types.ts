// Core domain types shared by every package (providers, report, cli, web).

export type SeedType =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "username"
  | "domain"
  | "social_profile"
  | "employer"
  | "university"
  | "certification"
  | "other";

export interface Seed {
  id: string;
  investigationId: string;
  type: SeedType;
  value: string;
  label?: string; // e.g. "current", "previous", "business"
  addedAt: string; // ISO timestamp
}

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type InvestigationModule =
  | "search_engine"
  | "email"
  | "phone"
  | "address"
  | "name"
  | "username"
  | "social_media"
  | "professional"
  | "documents"
  | "breach"
  | "github"
  | "dns"
  | "archive";

export type ExposureType =
  | "email_exposed_publicly"
  | "email_associated_with_account"
  | "email_associated_with_business"
  | "email_appears_in_document"
  | "email_appears_in_breach"
  | "email_historical_result"
  | "phone_exposed_publicly"
  | "phone_business_association"
  | "address_indexed_publicly"
  | "name_match"
  | "username_match"
  | "social_profile"
  | "professional_profile"
  | "document_exposure"
  | "breach_exposure"
  | "code_repository_exposure"
  | "potential_secret"
  | "domain_dns_exposure"
  | "subdomain_exposure"
  | "historical_archive"
  | "source_unavailable";

export type RemediationStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "REMOVED"
  | "VERIFIED_REMOVED"
  | "UNABLE_TO_REMOVE";

export interface Finding {
  id: string;
  investigationId: string;
  seedId: string;
  identifierType: SeedType;
  identifierValue: string; // may be redacted for display
  module: InvestigationModule;
  source: string; // provider name, e.g. "brave_search", "hibp", "crt.sh"
  providerMode: "live" | "mock" | "manual";
  platform?: string; // e.g. "GitHub", "LinkedIn"
  title?: string;
  url?: string;
  snippet?: string;
  evidence: string;
  exposureType: ExposureType;
  riskLevel: RiskLevel;
  identityConfidence: ConfidenceLevel;
  confidenceReason: string;
  discoveredAt: string;
  firstObservedAt?: string;
  lastObservedAt?: string;
  metadata: Record<string, unknown>;
  redacted: boolean;
  status: RemediationStatus;
  recommendedAction: string;
  dedupeKey: string;
}

export interface SourceUnavailable {
  source: string;
  reason: string;
  url?: string;
  recommendedManualVerification: string;
}

export interface ResearchLogEntry {
  id: string;
  investigationId: string;
  timestamp: string;
  query: string;
  source: string;
  url?: string;
  httpStatus?: number;
  result: string; // short human-readable outcome summary, no raw sensitive payloads
  identifierSearched: string; // may be redacted
  module: InvestigationModule;
  confidence: ConfidenceLevel;
}

export type IdentityNodeType =
  | "person"
  | "name"
  | "email"
  | "phone"
  | "address"
  | "username"
  | "employer"
  | "university"
  | "social_profile"
  | "website"
  | "document"
  | "domain";

export interface IdentityNode {
  id: string;
  type: IdentityNodeType;
  label: string;
  confidence: ConfidenceLevel;
  weight: number; // 0..1 aggregate confidence weight
}

export interface IdentityEdge {
  source: string;
  target: string;
  relation: string;
  weight: number; // 0..1
  findingIds: string[];
}

export interface IdentityGraph {
  nodes: IdentityNode[];
  edges: IdentityEdge[];
}

export interface RiskScore {
  exposureScore: number; // 0-100
  identityRisk: number;
  privacyRisk: number;
  socialEngineeringRisk: number;
  accountTakeoverRisk: number;
  reputationRisk: number;
  counts: { critical: number; high: number; medium: number; low: number };
}

export interface RemediationItem {
  id: string;
  investigationId: string;
  findingId: string;
  action: string;
  status: RemediationStatus;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface Investigation {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  seeds: Seed[];
}

export interface ProviderContext {
  investigationId: string;
  config: DfiConfig;
  now: () => string;
}

export interface ProviderResult {
  findings: Finding[];
  logEntries: ResearchLogEntry[];
  unavailable: SourceUnavailable[];
}

export interface DfiConfig {
  investigation: {
    search_engines: boolean;
    breach_checks: boolean;
    social_search: boolean;
    github_search: boolean;
    document_search: boolean;
    dns_search: boolean;
    archive_search: boolean;
    certificate_transparency: boolean;
  };
  privacy: {
    redact_sensitive_data: boolean;
    store_raw_results: boolean;
    local_only: boolean;
  };
  risk: {
    enabled: boolean;
    weights: { critical: number; high: number; medium: number; low: number };
  };
  rate_limit: {
    requests_per_second: number;
    max_retries: number;
    backoff_base_ms: number;
    request_timeout_ms: number;
    cache_ttl_seconds: number;
  };
  retention: { research_log_days: number };
  platforms: { username_enumeration: string[] };
}

import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import type { DfiConfig } from "./types";

export const DEFAULT_CONFIG: DfiConfig = {
  investigation: {
    search_engines: true,
    breach_checks: true,
    social_search: true,
    github_search: true,
    document_search: true,
    dns_search: true,
    archive_search: true,
    certificate_transparency: true,
  },
  privacy: {
    redact_sensitive_data: true,
    store_raw_results: false,
    local_only: true,
  },
  risk: {
    enabled: true,
    weights: { critical: 40, high: 20, medium: 8, low: 2 },
  },
  rate_limit: {
    requests_per_second: 2,
    max_retries: 3,
    backoff_base_ms: 500,
    request_timeout_ms: 10000,
    cache_ttl_seconds: 3600,
  },
  retention: { research_log_days: 90 },
  platforms: {
    username_enumeration: [
      "github",
      "gitlab",
      "reddit",
      "x",
      "instagram",
      "tiktok",
      "youtube",
      "stackoverflow",
      "medium",
      "devto",
      "hackernews",
      "keybase",
    ],
  },
};

function deepMerge<T>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const key of Object.keys(override ?? {})) {
    const overrideVal = (override as any)[key];
    const baseVal = (base as any)[key];
    if (
      overrideVal &&
      typeof overrideVal === "object" &&
      !Array.isArray(overrideVal) &&
      baseVal &&
      typeof baseVal === "object"
    ) {
      out[key] = deepMerge(baseVal, overrideVal);
    } else if (overrideVal !== undefined) {
      out[key] = overrideVal;
    }
  }
  return out;
}

export function loadConfig(path = "./config.yaml"): DfiConfig {
  if (!existsSync(path)) return DEFAULT_CONFIG;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = parse(raw) ?? {};
    return deepMerge(DEFAULT_CONFIG, parsed as Partial<DfiConfig>);
  } catch {
    // Malformed config must never crash the app — fall back to safe defaults.
    return DEFAULT_CONFIG;
  }
}

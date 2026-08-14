// Shared, hardened HTTP client for all OSINT providers:
//  - per-host allow-list (SSRF hardening — never fetches a user-supplied URL blindly)
//  - request timeout
//  - exponential backoff retry on 429/5xx/network errors
//  - simple token-bucket throttling (requests_per_second)
//  - in-memory response caching (cache_ttl_seconds)
//  - explicit, honest User-Agent identifying this as a self-audit tool
import type { DfiConfig } from "@dfi/core";

export const USER_AGENT = "DFI-DigitalFootprintIntelligence/0.1 (self-OSINT audit tool; +local)";

export interface FetchOptions {
  headers?: Record<string, string>;
  method?: "GET" | "HEAD" | "POST";
  body?: string;
  allowedHosts: string[]; // required — caller must be explicit about what it's contacting
}

export class SourceUnavailableError extends Error {
  constructor(
    public readonly reason: string,
    public readonly url?: string
  ) {
    super(reason);
  }
}

interface CacheEntry {
  expiresAt: number;
  status: number;
  body: string;
}

const cache = new Map<string, CacheEntry>();
const lastRequestAtByHost = new Map<string, number>();

function assertAllowedHost(url: URL, allowedHosts: string[]) {
  const ok = allowedHosts.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  if (!ok) {
    throw new SourceUnavailableError(`Blocked request to non-allow-listed host: ${url.hostname}`, url.toString());
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SourceUnavailableError(`Blocked non-HTTP(S) scheme: ${url.protocol}`, url.toString());
  }
}

async function throttle(host: string, minIntervalMs: number) {
  const last = lastRequestAtByHost.get(host) ?? 0;
  const wait = last + minIntervalMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAtByHost.set(host, Date.now());
}

export interface HttpResult {
  status: number;
  body: string;
  ok: boolean;
  fromCache: boolean;
}

export async function safeFetch(rawUrl: string, config: DfiConfig, opts: FetchOptions): Promise<HttpResult> {
  const url = new URL(rawUrl);
  assertAllowedHost(url, opts.allowedHosts);

  const cacheKey = `${opts.method ?? "GET"}:${rawUrl}:${opts.body ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { status: cached.status, body: cached.body, ok: cached.status < 400, fromCache: true };
  }

  const minIntervalMs = 1000 / Math.max(0.1, config.rate_limit.requests_per_second);
  const maxRetries = config.rate_limit.max_retries;
  const timeoutMs = config.rate_limit.request_timeout_ms;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await throttle(url.hostname, minIntervalMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "User-Agent": USER_AGENT, ...(opts.headers ?? {}) },
        body: opts.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await res.text();

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const backoff = config.rate_limit.backoff_base_ms * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (res.status < 400 && config.rate_limit.cache_ttl_seconds > 0) {
        cache.set(cacheKey, { expiresAt: Date.now() + config.rate_limit.cache_ttl_seconds * 1000, status: res.status, body });
      }
      return { status: res.status, body, ok: res.status < 400, fromCache: false };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < maxRetries) {
        const backoff = config.rate_limit.backoff_base_ms * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw new SourceUnavailableError(
    `Request failed after ${maxRetries + 1} attempts: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    rawUrl
  );
}

export function clearHttpCache() {
  cache.clear();
}

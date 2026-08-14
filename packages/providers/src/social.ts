import { newId, type ProviderContext, type ProviderResult, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const SUPPORTED: SeedType[] = ["username"];

interface PlatformCheckResult {
  exists: boolean;
  profileUrl: string;
  displayName?: string;
  bio?: string;
  extra?: Record<string, unknown>;
}

interface Platform {
  key: string;
  label: string;
  allowedHosts: string[];
  /** The real public profile URL for this platform — used both on a successful check and as the manual-verification link when the live check fails. Never guessed from `key` (e.g. "devto" is dev.to, not devto.com). */
  profileUrl: (u: string) => string;
  /** Live, ToS-respecting existence check via a documented public API/endpoint. */
  check?: (username: string, config: ProviderContext["config"]) => Promise<PlatformCheckResult | undefined>;
  /** Platforms that reliably block automated checks (login walls, aggressive bot detection) — never scraped. */
  manualOnly?: { reason: string };
}

const PLATFORMS: Platform[] = [
  {
    key: "gitlab",
    label: "GitLab",
    allowedHosts: ["gitlab.com"],
    profileUrl: (u) => `https://gitlab.com/${u}`,
    async check(username, config) {
      const res = await safeFetch(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(username)}`, config, {
        allowedHosts: ["gitlab.com"],
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new SourceUnavailableError(`GitLab API returned HTTP ${res.status}`, username);
      const arr = JSON.parse(res.body || "[]");
      if (!arr.length) return undefined;
      return { exists: true, profileUrl: arr[0].web_url, displayName: arr[0].name, bio: arr[0].bio };
    },
  },
  {
    key: "devto",
    label: "Dev.to",
    allowedHosts: ["dev.to"],
    profileUrl: (u) => `https://dev.to/${u}`,
    async check(username, config) {
      const res = await safeFetch(`https://dev.to/api/users/by_username?url=${encodeURIComponent(username)}`, config, {
        allowedHosts: ["dev.to"],
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new SourceUnavailableError(`Dev.to API returned HTTP ${res.status}`, username);
      const u = JSON.parse(res.body);
      return { exists: true, profileUrl: `https://dev.to/${u.username}`, displayName: u.name, bio: u.summary };
    },
  },
  {
    key: "stackoverflow",
    label: "Stack Overflow",
    allowedHosts: ["api.stackexchange.com"],
    profileUrl: (u) => `https://stackoverflow.com/users?search=${encodeURIComponent(u)}`,
    async check(username, config) {
      const res = await safeFetch(
        `https://api.stackexchange.com/2.3/users?inname=${encodeURIComponent(username)}&site=stackoverflow`,
        config,
        { allowedHosts: ["api.stackexchange.com"], headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new SourceUnavailableError(`Stack Exchange API returned HTTP ${res.status}`, username);
      const json = JSON.parse(res.body);
      const exact = (json.items ?? []).find((u: any) => u.display_name?.toLowerCase() === username.toLowerCase());
      if (!exact) return undefined;
      return { exists: true, profileUrl: exact.link, displayName: exact.display_name, extra: { reputation: exact.reputation } };
    },
  },
  {
    key: "keybase",
    label: "Keybase",
    allowedHosts: ["keybase.io"],
    profileUrl: (u) => `https://keybase.io/${u}`,
    async check(username, config) {
      const res = await safeFetch(`https://keybase.io/_/api/1.0/user/lookup.json?usernames=${encodeURIComponent(username)}`, config, {
        allowedHosts: ["keybase.io"],
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new SourceUnavailableError(`Keybase API returned HTTP ${res.status}`, username);
      const json = JSON.parse(res.body);
      const found = json?.them?.[0];
      if (!found) return undefined;
      return { exists: true, profileUrl: `https://keybase.io/${username}`, displayName: found.profile?.full_name };
    },
  },
  {
    key: "hackernews",
    label: "Hacker News",
    allowedHosts: ["hn.algolia.com"],
    profileUrl: (u) => `https://news.ycombinator.com/user?id=${encodeURIComponent(u)}`,
    async check(username, config) {
      const res = await safeFetch(`https://hn.algolia.com/api/v1/users/${encodeURIComponent(username)}`, config, {
        allowedHosts: ["hn.algolia.com"],
        headers: { Accept: "application/json" },
      });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new SourceUnavailableError(`HN Algolia API returned HTTP ${res.status}`, username);
      const json = JSON.parse(res.body);
      if (!json?.username) return undefined;
      return { exists: true, profileUrl: `https://news.ycombinator.com/user?id=${username}`, extra: { karma: json.karma } };
    },
  },
  { key: "x", label: "X / Twitter", allowedHosts: [], profileUrl: (u) => `https://x.com/${u}`, manualOnly: { reason: "X actively blocks unauthenticated automated profile checks (login wall / bot detection)." } },
  { key: "instagram", label: "Instagram", allowedHosts: [], profileUrl: (u) => `https://instagram.com/${u}`, manualOnly: { reason: "Instagram requires login and aggressively blocks automated profile checks." } },
  { key: "tiktok", label: "TikTok", allowedHosts: [], profileUrl: (u) => `https://www.tiktok.com/@${u}`, manualOnly: { reason: "TikTok uses bot-detection (CAPTCHA) that blocks automated checks." } },
  { key: "facebook", label: "Facebook", allowedHosts: [], profileUrl: (u) => `https://facebook.com/${u}`, manualOnly: { reason: "Facebook requires login for profile lookups and blocks automated access." } },
  { key: "youtube", label: "YouTube", allowedHosts: [], profileUrl: (u) => `https://www.youtube.com/@${u}`, manualOnly: { reason: "Reliable existence checks require the YouTube Data API (quota-limited key not configured)." } },
  { key: "reddit", label: "Reddit", allowedHosts: [], profileUrl: (u) => `https://www.reddit.com/user/${u}`, manualOnly: { reason: "Reddit's unauthenticated JSON endpoints are heavily rate-limited/blocked for automated clients." } },
];

export const socialProvider: OsintProvider = {
  name: "social_username_enum",
  label: "Social/Developer Platform Username Enumeration (Modules 8 & 9)",
  module: "username",
  requiresApiKey: false,
  isConfigured: () => true,
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const enabledKeys = new Set(ctx.config.platforms.username_enumeration);
    const platforms = PLATFORMS.filter((p) => enabledKeys.has(p.key));

    for (const platform of platforms) {
      if (platform.manualOnly) {
        result.unavailable.push({
          source: `social:${platform.key}`,
          reason: platform.manualOnly.reason,
          url: platform.profileUrl(seed.value),
          recommendedManualVerification: `Manually visit ${platform.profileUrl(seed.value)} while logged in to check for an account.`,
        });
        result.logEntries.push({
          id: newId("log"),
          investigationId: ctx.investigationId,
          timestamp: ctx.now(),
          query: `username check: ${platform.label}`,
          source: `social:${platform.key}`,
          result: "Source unavailable (blocks automated access)",
          identifierSearched: seed.value,
          module: this.module,
          confidence: "UNKNOWN",
        });
        continue;
      }

      let checkResult: PlatformCheckResult | undefined;
      try {
        checkResult = await platform.check!(seed.value, ctx.config);
      } catch (err) {
        const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
        const fallbackUrl = platform.profileUrl(seed.value);
        result.unavailable.push({
          source: `social:${platform.key}`,
          reason,
          url: fallbackUrl,
          recommendedManualVerification: `Manually check ${fallbackUrl}`,
        });
        result.logEntries.push({
          id: newId("log"),
          investigationId: ctx.investigationId,
          timestamp: ctx.now(),
          query: `username check: ${platform.label}`,
          source: `social:${platform.key}`,
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
        query: `username check: ${platform.label}`,
        source: `social:${platform.key}`,
        result: checkResult ? "Profile found" : "No profile found",
        identifierSearched: seed.value,
        module: this.module,
        confidence: checkResult ? "HIGH" : "MEDIUM",
      });

      if (checkResult?.exists) {
        const finding = normalizeFinding(
          {
            seed,
            module: "username",
            source: `social:${platform.key}`,
            providerMode: "live",
            platform: platform.label,
            title: `${platform.label}: ${checkResult.displayName ?? seed.value}`,
            url: checkResult.profileUrl,
            snippet: checkResult.bio,
            evidence: `Exact username match found on ${platform.label}.`,
            exposureType: "username_match",
            riskLevel: "MEDIUM",
            identityConfidence: "MEDIUM",
            confidenceReason: "Exact username match; identity not yet corroborated by a second independent source.",
            metadata: { platform: platform.key, ...checkResult.extra },
          },
          ctx
        );
        if (validateFinding(finding)) result.findings.push(finding);
      }
    }

    return result;
  },
};

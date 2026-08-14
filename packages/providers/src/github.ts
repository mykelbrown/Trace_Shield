import { detectSecrets, newId, type ProviderContext, type ProviderResult, type Seed, type SeedType } from "@dfi/core";
import type { OsintProvider } from "./types";
import { normalizeFinding, validateFinding } from "./helpers";
import { safeFetch, SourceUnavailableError } from "./http-client";

const ALLOWED_HOSTS = ["api.github.com"];
const SUPPORTED: SeedType[] = ["username", "email", "name"];

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function checkUserProfile(username: string, config: ProviderContext["config"]) {
  const res = await safeFetch(`https://api.github.com/users/${encodeURIComponent(username)}`, config, {
    allowedHosts: ALLOWED_HOSTS,
    headers: authHeaders(),
  });
  if (res.status === 404) return undefined;
  if (!res.ok) throw new SourceUnavailableError(`GitHub user API returned HTTP ${res.status}`, username);
  return JSON.parse(res.body) as {
    login: string;
    html_url: string;
    name?: string;
    bio?: string;
    company?: string;
    location?: string;
    blog?: string;
    email?: string;
    public_repos: number;
    created_at: string;
  };
}

interface CodeSearchItem {
  name: string;
  path: string;
  html_url: string;
  repository: { full_name: string; html_url: string };
  text_matches?: { fragment: string }[];
}

async function codeSearch(query: string, config: ProviderContext["config"]): Promise<CodeSearchItem[]> {
  const res = await safeFetch(
    `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=10`,
    config,
    { allowedHosts: ALLOWED_HOSTS, headers: { ...authHeaders(), Accept: "application/vnd.github.text-match+json" } }
  );
  if (!res.ok) throw new SourceUnavailableError(`GitHub code search returned HTTP ${res.status}`, query);
  const json = JSON.parse(res.body);
  return (json?.items ?? []) as CodeSearchItem[];
}

function mockCodeSearch(query: string): CodeSearchItem[] {
  return [
    {
      name: "config.sample.yml",
      path: "config/config.sample.yml",
      html_url: "https://github.example.invalid/mock/repo/blob/main/config/config.sample.yml",
      repository: { full_name: "mock/repo", html_url: "https://github.example.invalid/mock/repo" },
      text_matches: [{ fragment: `[MOCK DATA] contact: ${query} # configure GITHUB_TOKEN for live code search` }],
    },
  ];
}

export const githubProvider: OsintProvider = {
  name: "github",
  label: "GitHub (Module 13 — Code / Repository Exposure)",
  module: "github",
  requiresApiKey: false, // username profile checks work unauthenticated; code search needs a token
  isConfigured: () => Boolean(process.env.GITHUB_TOKEN),
  supports: (t) => SUPPORTED.includes(t),
  async search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult> {
    const result: ProviderResult = { findings: [], logEntries: [], unavailable: [] };
    const hasToken = this.isConfigured();

    if (seed.type === "username") {
      try {
        const profile = await checkUserProfile(seed.value, ctx.config);
        result.logEntries.push({
          id: newId("log"),
          investigationId: ctx.investigationId,
          timestamp: ctx.now(),
          query: `GET /users/${seed.value}`,
          source: this.name,
          httpStatus: profile ? 200 : 404,
          result: profile ? "Profile found" : "No profile found",
          identifierSearched: seed.value,
          module: this.module,
          confidence: profile ? "HIGH" : "MEDIUM",
        });
        if (profile) {
          const finding = normalizeFinding(
            {
              seed,
              module: "github",
              source: this.name,
              providerMode: "live",
              platform: "GitHub",
              title: `GitHub: @${profile.login}`,
              url: profile.html_url,
              snippet: profile.bio,
              evidence: `Exact username match on GitHub. Public repos: ${profile.public_repos}, account created ${profile.created_at}.`,
              exposureType: "username_match",
              riskLevel: "MEDIUM",
              identityConfidence: "HIGH",
              confidenceReason: "Exact username match with an active, publicly viewable profile.",
              metadata: { employer: profile.company ?? undefined, website: profile.blog ?? undefined, alsoEmail: profile.email ?? undefined, location: profile.location ?? undefined },
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
          url: `https://github.com/${seed.value}`,
          recommendedManualVerification: `Manually visit https://github.com/${seed.value}`,
        });
      }
    }

    // Code search — always attempted, but requires GITHUB_TOKEN for live results.
    const query = seed.type === "email" ? `"${seed.value}"` : seed.type === "username" ? `"${seed.value}"` : `"${seed.value}"`;
    let items: CodeSearchItem[] = [];
    if (hasToken) {
      try {
        items = await codeSearch(query, ctx.config);
      } catch (err) {
        const reason = err instanceof SourceUnavailableError ? err.reason : String(err);
        result.unavailable.push({
          source: this.name,
          reason,
          url: `https://github.com/search?q=${encodeURIComponent(query)}&type=code`,
          recommendedManualVerification: `Manually search https://github.com/search?q=${encodeURIComponent(query)}&type=code`,
        });
      }
    } else {
      result.unavailable.push({
        source: this.name,
        reason: "GITHUB_TOKEN not configured — GitHub code search requires authentication. Using bundled mock provider instead.",
        url: `https://github.com/search?q=${encodeURIComponent(query)}&type=code`,
        recommendedManualVerification: `Set GITHUB_TOKEN (see .env.example) or manually search https://github.com/search?q=${encodeURIComponent(query)}&type=code`,
      });
      items = mockCodeSearch(seed.value);
    }

    for (const item of items) {
      const fragment = item.text_matches?.[0]?.fragment ?? "";
      const secrets = detectSecrets(fragment);
      const finding = normalizeFinding(
        {
          seed,
          module: "github",
          source: this.name,
          providerMode: hasToken ? "live" : "mock",
          platform: "GitHub",
          title: `${item.repository.full_name}: ${item.path}`,
          url: item.html_url,
          snippet: fragment,
          evidence: secrets.length > 0
            ? `Potential secret detected (${secrets.map((s) => s.type).join(", ")}) in ${item.repository.full_name}/${item.path}. Value redacted — rotate/revoke immediately.`
            : `"${seed.value}" appears in ${item.repository.full_name}/${item.path}.`,
          exposureType: secrets.length > 0 ? "potential_secret" : "code_repository_exposure",
          riskLevel: secrets.length > 0 ? "CRITICAL" : "MEDIUM",
          identityConfidence: seed.type === "username" ? "MEDIUM" : "LOW",
          confidenceReason: seed.type === "username" ? "Exact username match in repository content." : "Identifier text match in repository content; may be coincidental.",
          metadata: { repository: item.repository.full_name, path: item.path, secretTypes: secrets.map((s) => s.type) },
          recommendedAction: secrets.length > 0 ? "Revoke/rotate the credential immediately, then purge it from git history." : undefined,
        },
        ctx
      );
      if (validateFinding(finding)) result.findings.push(finding);
    }

    result.logEntries.push({
      id: newId("log"),
      investigationId: ctx.investigationId,
      timestamp: ctx.now(),
      query,
      source: this.name,
      result: `${items.length} code result(s) (${hasToken ? "live" : "mock"})`,
      identifierSearched: seed.value,
      module: this.module,
      confidence: "LOW",
    });

    return result;
  },
};

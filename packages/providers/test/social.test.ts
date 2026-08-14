import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CONFIG, type ProviderContext, type Seed } from "@dfi/core";

// Force every live platform check to fail so we can assert the fallback
// (manual-verification) URL recorded in `unavailable` points at each
// platform's real domain — this is a regression test for a bug where the
// fallback guessed `${platform.key}.com`, producing nonexistent URLs like
// devto.com, keybase.com, and hackernews.com instead of dev.to, keybase.io,
// and news.ycombinator.com.
vi.mock("../src/http-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/http-client")>();
  return {
    ...actual,
    safeFetch: vi.fn().mockRejectedValue(new actual.SourceUnavailableError("simulated network failure")),
  };
});

const seed: Seed = { id: "s1", investigationId: "inv", type: "username", value: "alexmorgan_test", addedAt: "2026-01-01T00:00:00.000Z" };
const ctx: ProviderContext = { investigationId: "inv", config: DEFAULT_CONFIG, now: () => "2026-01-01T00:00:00.000Z" };

describe("socialProvider fallback URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses each platform's real domain in the manual-verification URL when the live check fails", async () => {
    const { socialProvider } = await import("../src/social");
    const result = await socialProvider.search(seed, ctx);

    const byPlatform = new Map(result.unavailable.map((u) => [u.source, u.url]));

    expect(byPlatform.get("social:devto")).toContain("dev.to");
    expect(byPlatform.get("social:devto")).not.toContain("devto.com");

    expect(byPlatform.get("social:keybase")).toContain("keybase.io");
    expect(byPlatform.get("social:keybase")).not.toContain("keybase.com");

    expect(byPlatform.get("social:hackernews")).toContain("news.ycombinator.com");
    expect(byPlatform.get("social:hackernews")).not.toContain("hackernews.com");

    expect(byPlatform.get("social:gitlab")).toContain("gitlab.com");
    expect(byPlatform.get("social:stackoverflow")).toContain("stackoverflow.com");
  });

  it("every unavailable entry's URL is a well-formed http(s) URL", async () => {
    const { socialProvider } = await import("../src/social");
    const result = await socialProvider.search(seed, ctx);
    for (const u of result.unavailable) {
      expect(u.url).toBeDefined();
      expect(() => new URL(u.url!)).not.toThrow();
    }
  });
});

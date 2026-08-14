import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "@dfi/core";
import { safeFetch, SourceUnavailableError } from "../src/http-client";

describe("safeFetch SSRF hardening", () => {
  it("refuses to contact a host outside the caller's allow-list", async () => {
    await expect(
      safeFetch("https://evil.internal.example/steal-data", DEFAULT_CONFIG, { allowedHosts: ["api.search.brave.com"] })
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("refuses a non-http(s) scheme even if the host would otherwise match", async () => {
    await expect(
      safeFetch("file:///etc/passwd", DEFAULT_CONFIG, { allowedHosts: ["passwd"] })
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("allows subdomains of an allow-listed host but not look-alike domains", async () => {
    // api.search.brave.com.evil.example is NOT a subdomain of brave.com and must be rejected.
    await expect(
      safeFetch("https://api.search.brave.com.evil.example/x", DEFAULT_CONFIG, { allowedHosts: ["api.search.brave.com"] })
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});

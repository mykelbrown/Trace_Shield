import { describe, it, expect } from "vitest";
import { generateEmailQueries, generatePhoneQueries, generateQueriesForSeed, generateUsernameQueries } from "../src/query-gen";
import type { Seed } from "../src/types";

const emailSeed: Seed = { id: "s1", investigationId: "inv", type: "email", value: "alex.morgan@example.com", addedAt: "2026-01-01T00:00:00.000Z" };
const phoneSeed: Seed = { id: "s2", investigationId: "inv", type: "phone", value: "+353000000000", addedAt: "2026-01-01T00:00:00.000Z" };
const usernameSeed: Seed = { id: "s3", investigationId: "inv", type: "username", value: "alexmorgan_test", addedAt: "2026-01-01T00:00:00.000Z" };

describe("generateEmailQueries", () => {
  it("includes an exact-match query and document filetype queries", () => {
    const queries = generateEmailQueries(emailSeed).map((q) => q.query);
    expect(queries).toContain(`"alex.morgan@example.com"`);
    expect(queries.some((q) => q.includes("filetype:pdf"))).toBe(true);
    expect(queries.some((q) => q.includes("filetype:xlsx"))).toBe(true);
    expect(queries.some((q) => q.includes("account"))).toBe(true);
  });

  it("every generated query references the seed id", () => {
    const queries = generateEmailQueries(emailSeed);
    expect(queries.every((q) => q.seedId === emailSeed.id)).toBe(true);
  });
});

describe("generatePhoneQueries", () => {
  it("covers multiple phone number formats without duplicates", () => {
    const queries = generatePhoneQueries(phoneSeed).map((q) => q.query);
    const unique = new Set(queries);
    expect(unique.size).toBe(queries.length);
    expect(queries.some((q) => q.includes("+353"))).toBe(true);
  });
});

describe("generateUsernameQueries", () => {
  it("generates profile/forum/github variants", () => {
    const queries = generateUsernameQueries(usernameSeed).map((q) => q.query);
    expect(queries).toContain(`"alexmorgan_test"`);
    expect(queries.some((q) => q.includes("github"))).toBe(true);
    expect(queries.some((q) => q.includes("forum"))).toBe(true);
  });
});

describe("generateQueriesForSeed dispatch", () => {
  it("dispatches by seed type", () => {
    expect(generateQueriesForSeed(emailSeed).length).toBeGreaterThan(0);
    expect(generateQueriesForSeed(phoneSeed).length).toBeGreaterThan(0);
    expect(generateQueriesForSeed(usernameSeed).length).toBeGreaterThan(0);
  });

  it("falls back to a generic exact-match query for unmodeled seed types", () => {
    const seed: Seed = { id: "s4", investigationId: "inv", type: "certification", value: "CISSP", addedAt: "2026-01-01T00:00:00.000Z" };
    const queries = generateQueriesForSeed(seed);
    expect(queries).toEqual([{ seedId: "s4", query: `"CISSP"`, purpose: "generic exact match" }]);
  });
});

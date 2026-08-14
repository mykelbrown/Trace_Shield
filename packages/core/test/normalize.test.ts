import { describe, it, expect } from "vitest";
import {
  emailDomain,
  isValidDomain,
  isValidEmail,
  isValidHttpUrl,
  isValidPhone,
  isValidUsername,
  nameParts,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
} from "../src/normalize";

describe("email normalization", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Alex.Morgan@Example.COM  ")).toBe("alex.morgan@example.com");
  });
  it("validates well-formed emails", () => {
    expect(isValidEmail("alex.morgan@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
  });
  it("extracts the domain", () => {
    expect(emailDomain("alex.morgan@example.com")).toBe("example.com");
  });
});

describe("phone normalization", () => {
  it("normalizes an Irish national number to E.164", () => {
    const v = normalizePhone("0871234567", "353");
    expect(v.e164).toBe("+353871234567");
    expect(v.countryCode).toBe("353");
  });
  it("normalizes an already-international number", () => {
    const v = normalizePhone("+353 87 123 4567");
    expect(v.e164).toBe("+353871234567");
  });
  it("normalizes 00-prefixed international dialing", () => {
    const v = normalizePhone("00353871234567");
    expect(v.e164).toBe("+353871234567");
  });
  it("produces a national trunk-prefixed form", () => {
    const v = normalizePhone("+353871234567");
    expect(v.national).toBe("0871234567");
  });
  it("validates phone-like strings", () => {
    expect(isValidPhone("+353 87 123 4567")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("not a phone")).toBe(false);
  });
});

describe("username normalization", () => {
  it("strips a leading @", () => {
    expect(normalizeUsername("@alexmorgan_test")).toBe("alexmorgan_test");
  });
  it("validates username character sets", () => {
    expect(isValidUsername("alexmorgan_test")).toBe(true);
    expect(isValidUsername("has spaces")).toBe(false);
    expect(isValidUsername("a")).toBe(false); // too short
  });
});

describe("name parsing", () => {
  it("splits first/middle/last", () => {
    expect(nameParts("Alex J Morgan")).toEqual({ first: "Alex", middle: ["J"], last: "Morgan" });
  });
  it("handles a single-word name", () => {
    expect(nameParts("Alex")).toEqual({ first: "Alex" });
  });
});

describe("domain normalization", () => {
  it("strips protocol and path", () => {
    expect(normalizeDomain("https://Example.com/path?x=1")).toBe("example.com");
  });
  it("validates domain syntax", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("not a domain")).toBe(false);
    expect(isValidDomain("-bad.com")).toBe(false);
  });
});

describe("URL validation", () => {
  it("accepts http(s) URLs only", () => {
    expect(isValidHttpUrl("https://example.com")).toBe(true);
    expect(isValidHttpUrl("http://example.com")).toBe(true);
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isValidHttpUrl("not a url")).toBe(false);
    expect(isValidHttpUrl("ftp://example.com")).toBe(false);
  });
});

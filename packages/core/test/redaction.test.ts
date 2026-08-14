import { describe, it, expect } from "vitest";
import { detectSecrets, maskIdentifier, redactSecrets } from "../src/redaction";

describe("secret detection", () => {
  it("detects an AWS access key", () => {
    const matches = detectSecrets("aws_key = AKIAABCDEFGHIJKLMNOP");
    expect(matches.some((m) => m.type === "AWS Access Key")).toBe(true);
    expect(matches[0].risk).toBe("CRITICAL");
  });

  it("detects a GitHub token", () => {
    const matches = detectSecrets(`token: ghp_${"a".repeat(36)}`);
    expect(matches.some((m) => m.type === "GitHub Token")).toBe(true);
  });

  it("detects a JWT", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const matches = detectSecrets(`Authorization: Bearer ${jwt}`);
    expect(matches.some((m) => m.type === "JWT")).toBe(true);
  });

  it("finds nothing in ordinary text", () => {
    expect(detectSecrets("Alex Morgan works as a software engineer in Dublin.")).toHaveLength(0);
  });
});

describe("redactSecrets", () => {
  it("never leaves the raw secret value in the redacted output", () => {
    const secret = "AKIAABCDEFGHIJKLMNOP";
    const { redacted, found } = redactSecrets(`aws_key = ${secret}`);
    expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[REDACTED:AWS Access Key]");
    expect(found).toHaveLength(1);
  });

  it("redacts multiple secrets in one string without corrupting surrounding text", () => {
    const text = `key1=AKIAABCDEFGHIJKLMNOP key2=AKIAZYXWVUTSRQPONMLK`;
    const { redacted } = redactSecrets(text);
    expect(redacted).toContain("key1=[REDACTED:AWS Access Key]");
    expect(redacted).toContain("key2=[REDACTED:AWS Access Key]");
  });

  it("passes through text with no secrets unchanged", () => {
    const { redacted, found } = redactSecrets("nothing sensitive here");
    expect(redacted).toBe("nothing sensitive here");
    expect(found).toHaveLength(0);
  });
});

describe("maskIdentifier", () => {
  it("masks an email's local part", () => {
    const masked = maskIdentifier("alex.morgan@example.com", "email");
    expect(masked.endsWith("@example.com")).toBe(true);
    expect(masked).not.toBe("alex.morgan@example.com");
    expect(masked.startsWith("al")).toBe(true);
  });

  it("masks a phone number, keeping only the last 4 digits", () => {
    const masked = maskIdentifier("+353871234567", "phone");
    expect(masked.endsWith("4567")).toBe(true);
    expect(masked).not.toContain("871234567".slice(0, 5));
  });

  it("masks generic identifiers", () => {
    expect(maskIdentifier("alexmorgan_test", "username")).not.toBe("alexmorgan_test");
  });
});

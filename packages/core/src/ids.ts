import { randomUUID, createHash } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** Deterministic short hash used for dedupe keys — not a security primitive. */
export function stableHash(...parts: (string | undefined)[]): string {
  const h = createHash("sha256");
  h.update(parts.filter(Boolean).join("|").toLowerCase());
  return h.digest("hex").slice(0, 24);
}

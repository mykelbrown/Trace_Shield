import type { Finding } from "./types";
import { stableHash } from "./ids";

export function computeDedupeKey(f: Pick<Finding, "source" | "url" | "identifierValue" | "exposureType" | "platform">): string {
  return stableHash(f.source, f.url ?? "", f.identifierValue, f.exposureType, f.platform ?? "");
}

/**
 * Merges duplicate findings (same source+url+identifier+exposure type) into
 * one, tracking first/last observed timestamps across scans/re-scans.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const f of findings) {
    const key = f.dedupeKey || computeDedupeKey(f);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...f, dedupeKey: key });
      continue;
    }
    const firstObservedAt =
      [existing.firstObservedAt, existing.discoveredAt, f.firstObservedAt, f.discoveredAt]
        .filter(Boolean)
        .sort()[0] ?? existing.discoveredAt;
    const lastObservedAt =
      [existing.lastObservedAt, existing.discoveredAt, f.lastObservedAt, f.discoveredAt]
        .filter(Boolean)
        .sort()
        .at(-1) ?? f.discoveredAt;
    byKey.set(key, { ...existing, firstObservedAt, lastObservedAt });
  }
  return [...byKey.values()];
}

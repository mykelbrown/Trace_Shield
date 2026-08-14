import type {
  ConfidenceLevel,
  Finding,
  IdentityEdge,
  IdentityGraph,
  IdentityNode,
  IdentityNodeType,
  Seed,
  SeedType,
} from "./types";

const CONFIDENCE_WEIGHT: Record<ConfidenceLevel, number> = {
  HIGH: 0.9,
  MEDIUM: 0.6,
  LOW: 0.3,
  UNKNOWN: 0.15,
};

function weightToConfidence(weight: number): ConfidenceLevel {
  if (weight >= 0.8) return "HIGH";
  if (weight >= 0.5) return "MEDIUM";
  if (weight >= 0.25) return "LOW";
  return "UNKNOWN";
}

const SEED_TYPE_TO_NODE_TYPE: Record<SeedType, IdentityNodeType> = {
  name: "name",
  email: "email",
  phone: "phone",
  address: "address",
  username: "username",
  domain: "domain",
  social_profile: "social_profile",
  employer: "employer",
  university: "university",
  certification: "website",
  other: "website",
};

function nodeId(type: IdentityNodeType, value: string): string {
  return `${type}:${value.trim().toLowerCase()}`;
}

function upsertNode(nodes: Map<string, IdentityNode>, candidate: IdentityNode) {
  const existing = nodes.get(candidate.id);
  if (!existing) {
    nodes.set(candidate.id, candidate);
    return;
  }
  // Corroboration: seeing the same entity from another finding raises confidence.
  const boosted = Math.min(1, existing.weight + candidate.weight * 0.25);
  nodes.set(candidate.id, {
    ...existing,
    weight: boosted,
    confidence: weightToConfidence(boosted),
  });
}

function upsertEdge(
  edges: Map<string, IdentityEdge>,
  source: string,
  target: string,
  relation: string,
  weight: number,
  findingIds: string[]
) {
  const key = `${source}=>${target}:${relation}`;
  const existing = edges.get(key);
  if (!existing) {
    edges.set(key, { source, target, relation, weight, findingIds: [...findingIds] });
    return;
  }
  const mergedFindingIds = Array.from(new Set([...existing.findingIds, ...findingIds]));
  const boosted = Math.min(1, Math.max(existing.weight, weight) + (mergedFindingIds.length > existing.findingIds.length ? 0.05 : 0));
  edges.set(key, { source, target, relation, weight: boosted, findingIds: mergedFindingIds });
}

/** Fields inside finding.metadata that represent a correlatable entity, and the node type they map to. */
const CORRELATABLE_METADATA_FIELDS: Record<string, IdentityNodeType> = {
  employer: "employer",
  company: "employer",
  university: "university",
  school: "university",
  alsoEmail: "email",
  bioEmail: "email",
  alsoUsername: "username",
  website: "website",
  domain: "domain",
};

/**
 * Builds an identity graph from the seeds a user supplied and the findings
 * discovered about them. Confidence is derived, never assumed: every edge
 * carries the finding IDs that support it, and repeated independent
 * corroboration raises weight rather than a single source claiming HIGH.
 */
export function buildIdentityGraph(seeds: Seed[], findings: Finding[]): IdentityGraph {
  const nodes = new Map<string, IdentityNode>();
  const edges = new Map<string, IdentityEdge>();

  const personId = "person:root";
  nodes.set(personId, { id: personId, type: "person", label: "Person (you)", confidence: "HIGH", weight: 1 });

  const seedNodeId = new Map<string, string>();
  for (const seed of seeds) {
    const type = SEED_TYPE_TO_NODE_TYPE[seed.type] ?? "website";
    const id = nodeId(type, seed.value);
    seedNodeId.set(seed.id, id);
    upsertNode(nodes, { id, type, label: seed.value, confidence: "HIGH", weight: 1 });
    upsertEdge(edges, personId, id, "provided_by_user", 1, []);
  }

  for (const finding of findings) {
    const seedNode = seedNodeId.get(finding.seedId);
    if (!seedNode) continue;

    const targetType: IdentityNodeType = finding.platform
      ? "social_profile"
      : finding.exposureType.startsWith("document")
        ? "document"
        : finding.exposureType.startsWith("domain") || finding.exposureType.startsWith("subdomain")
          ? "domain"
          : "website";
    const targetLabel = finding.platform
      ? `${finding.platform}${finding.title ? `: ${finding.title}` : ""}`
      : (finding.title ?? finding.url ?? finding.identifierValue);
    const targetId = nodeId(targetType, finding.url ?? `${finding.source}:${finding.identifierValue}:${finding.title ?? finding.id}`);
    const weight = CONFIDENCE_WEIGHT[finding.identityConfidence];

    upsertNode(nodes, { id: targetId, type: targetType, label: targetLabel, confidence: finding.identityConfidence, weight });
    upsertEdge(edges, seedNode, targetId, finding.exposureType, weight, [finding.id]);

    for (const [key, rawVal] of Object.entries(finding.metadata)) {
      const mappedType = CORRELATABLE_METADATA_FIELDS[key];
      if (!mappedType || typeof rawVal !== "string" || !rawVal.trim()) continue;
      const mId = nodeId(mappedType, rawVal);
      upsertNode(nodes, { id: mId, type: mappedType, label: rawVal, confidence: finding.identityConfidence, weight });
      upsertEdge(edges, targetId, mId, `mentions_${key}`, weight, [finding.id]);
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

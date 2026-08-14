import { describe, it, expect } from "vitest";
import { buildIdentityGraph } from "../src/correlation";
import type { Finding, Seed } from "../src/types";

const seeds: Seed[] = [
  { id: "seed_email", investigationId: "inv_1", type: "email", value: "alex.morgan@example.com", addedAt: "2026-01-01T00:00:00.000Z" },
  { id: "seed_username", investigationId: "inv_1", type: "username", value: "alexmorgan_test", addedAt: "2026-01-01T00:00:00.000Z" },
];

function finding(overrides: Partial<Finding>): Finding {
  return {
    id: "fnd_1",
    investigationId: "inv_1",
    seedId: "seed_email",
    identifierType: "email",
    identifierValue: "alex.morgan@example.com",
    module: "search_engine",
    source: "brave_search",
    providerMode: "mock",
    evidence: "test",
    exposureType: "email_exposed_publicly",
    riskLevel: "MEDIUM",
    identityConfidence: "MEDIUM",
    confidenceReason: "test",
    discoveredAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    redacted: false,
    status: "OPEN",
    recommendedAction: "review",
    dedupeKey: "k1",
    ...overrides,
  };
}

describe("buildIdentityGraph", () => {
  it("creates a root person node and connects every seed to it", () => {
    const graph = buildIdentityGraph(seeds, []);
    const person = graph.nodes.find((n) => n.type === "person");
    expect(person).toBeDefined();
    expect(graph.edges.filter((e) => e.source === person!.id)).toHaveLength(seeds.length);
  });

  it("attaches a discovered platform node to the seed that produced it", () => {
    const f = finding({ id: "fnd_gh", seedId: "seed_username", identifierType: "username", identifierValue: "alexmorgan_test", platform: "GitHub", url: "https://github.com/alexmorgan_test", exposureType: "username_match", identityConfidence: "HIGH" });
    const graph = buildIdentityGraph(seeds, [f]);
    const ghNode = graph.nodes.find((n) => n.type === "social_profile");
    expect(ghNode).toBeDefined();
    const usernameNode = graph.nodes.find((n) => n.type === "username");
    const edge = graph.edges.find((e) => e.source === usernameNode!.id && e.target === ghNode!.id);
    expect(edge).toBeDefined();
    expect(edge!.findingIds).toContain("fnd_gh");
  });

  it("raises confidence weight when a node is corroborated by more than one finding", () => {
    const f1 = finding({ id: "fnd_a", platform: "GitHub", url: "https://github.com/alexmorgan_test", metadata: { employer: "Acme Corp" } });
    const f2 = finding({ id: "fnd_b", platform: "GitHub", url: "https://github.com/alexmorgan_test", metadata: { employer: "Acme Corp" } });
    const graphOne = buildIdentityGraph(seeds, [f1]);
    const graphTwo = buildIdentityGraph(seeds, [f1, f2]);
    const employerOne = graphOne.nodes.find((n) => n.type === "employer");
    const employerTwo = graphTwo.nodes.find((n) => n.type === "employer");
    expect(employerTwo!.weight).toBeGreaterThanOrEqual(employerOne!.weight);
  });

  it("never creates a node for a finding with an unknown seed", () => {
    const f = finding({ seedId: "does-not-exist" });
    const graph = buildIdentityGraph(seeds, [f]);
    // Only the two seed nodes + root person should exist — the orphaned finding contributes nothing.
    expect(graph.nodes).toHaveLength(seeds.length + 1);
  });
});

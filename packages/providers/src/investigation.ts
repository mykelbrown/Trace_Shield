// The end-to-end investigation workflow (spec section 34):
//   normalization -> query generation (inside each provider) -> multiple OSINT
//   sources -> result collection -> deduplication -> entity resolution /
//   identity correlation -> risk analysis -> exposure graph -> remediation.
import {
  buildIdentityGraph,
  computeRiskScore,
  deduplicateFindings,
  Db,
  newId,
  remediationFromFinding,
  socialEngineeringAnalysis,
  type DfiConfig,
  type Finding,
  type IdentityGraph,
  type Investigation,
  type ProviderContext,
  type ResearchLogEntry,
  type RiskScore,
  type Seed,
  type SocialEngineeringInsight,
  type SourceUnavailable,
} from "@dfi/core";
import { enabledProviders } from "./registry";
import type { OsintProvider } from "./types";

export interface InvestigationRunResult {
  investigation: Investigation;
  findings: Finding[];
  logEntries: ResearchLogEntry[];
  unavailable: SourceUnavailable[];
  graph: IdentityGraph;
  risk: RiskScore;
  socialEngineering: SocialEngineeringInsight[];
}

export interface RunOptions {
  /** Restrict to a subset of seed IDs — used by `dfi rescan` / re-scan of a single finding's source seed. */
  seedIds?: string[];
  /** Override the provider set — used by integration tests to inject deterministic mock providers instead of live network calls. */
  providers?: OsintProvider[];
}

export async function runInvestigation(
  db: Db,
  investigation: Investigation,
  config: DfiConfig,
  opts: RunOptions = {}
): Promise<InvestigationRunResult> {
  const now = () => new Date().toISOString();
  const ctx: ProviderContext = { investigationId: investigation.id, config, now };
  const providers = opts.providers ?? enabledProviders(config);

  const seeds = opts.seedIds ? investigation.seeds.filter((s) => opts.seedIds!.includes(s.id)) : investigation.seeds;

  const allFindings: Finding[] = [];
  const allLogs: ResearchLogEntry[] = [];
  const allUnavailable: SourceUnavailable[] = [];

  for (const seed of seeds) {
    for (const provider of providers) {
      if (!provider.supports(seed.type)) continue;
      try {
        const res = await provider.search(seed, ctx);
        allFindings.push(...res.findings);
        allLogs.push(...res.logEntries);
        allUnavailable.push(...res.unavailable);
      } catch (err) {
        // A single provider failure must never abort the whole investigation.
        allUnavailable.push({
          source: provider.name,
          reason: `Unexpected provider error: ${err instanceof Error ? err.message : String(err)}`,
          recommendedManualVerification: `Retry this scan, or investigate "${seed.value}" manually via ${provider.label}.`,
        });
      }
    }
  }

  const deduped = deduplicateFindings(allFindings);

  for (const finding of deduped) {
    db.upsertFinding(finding);
  }
  for (const log of allLogs) {
    db.addLogEntry(log);
  }
  db.pruneResearchLog(config.retention.research_log_days);
  db.touchInvestigation(investigation.id, now());

  // Persisted findings (post-upsert) carry preserved remediation status across re-scans.
  const persistedFindings = db.listFindings(investigation.id);

  const existingRemediationFindingIds = new Set(db.listRemediation(investigation.id).map((r) => r.findingId));
  for (const finding of persistedFindings) {
    if (!existingRemediationFindingIds.has(finding.id) && finding.exposureType !== "source_unavailable") {
      db.upsertRemediation(remediationFromFinding(finding, now()));
    }
  }

  const graph = buildIdentityGraph(investigation.seeds, persistedFindings);
  const risk = computeRiskScore(persistedFindings, config);
  const socialEngineering = socialEngineeringAnalysis(persistedFindings);

  return {
    investigation,
    findings: persistedFindings,
    logEntries: allLogs,
    unavailable: allUnavailable,
    graph,
    risk,
    socialEngineering,
  };
}

export function newInvestigation(name: string, seedInputs: Omit<Seed, "id" | "investigationId" | "addedAt">[]): Investigation {
  const id = newId("inv");
  const now = new Date().toISOString();
  const seeds: Seed[] = seedInputs.map((s) => ({
    ...s,
    id: newId("seed"),
    investigationId: id,
    addedAt: now,
  }));
  return { id, name, createdAt: now, updatedAt: now, seeds };
}

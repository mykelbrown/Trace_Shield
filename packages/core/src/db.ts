import { DatabaseSync, type DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type {
  Finding,
  Investigation,
  RemediationItem,
  RemediationStatus,
  ResearchLogEntry,
  Seed,
} from "./types";
import { computeDedupeKey } from "./dedup";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS investigations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seeds (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  added_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_seeds_investigation ON seeds(investigation_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  seed_id TEXT NOT NULL,
  identifier_type TEXT NOT NULL,
  identifier_value TEXT NOT NULL,
  module TEXT NOT NULL,
  source TEXT NOT NULL,
  provider_mode TEXT NOT NULL,
  platform TEXT,
  title TEXT,
  url TEXT,
  snippet TEXT,
  evidence TEXT NOT NULL,
  exposure_type TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  identity_confidence TEXT NOT NULL,
  confidence_reason TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  first_observed_at TEXT,
  last_observed_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  redacted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN',
  recommended_action TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_findings_investigation ON findings(investigation_id);
CREATE INDEX IF NOT EXISTS idx_findings_risk ON findings(risk_level);

CREATE TABLE IF NOT EXISTS research_log (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  timestamp TEXT NOT NULL,
  query TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT,
  http_status INTEGER,
  result TEXT NOT NULL,
  identifier_searched TEXT NOT NULL,
  module TEXT NOT NULL,
  confidence TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_investigation ON research_log(investigation_id);

CREATE TABLE IF NOT EXISTS remediation (
  id TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  finding_id TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_remediation_investigation ON remediation(investigation_id);
`;

export class Db {
  readonly conn: DatabaseSyncType;

  constructor(path: string) {
    if (path !== ":memory:") {
      const dir = dirname(path);
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    this.conn = new DatabaseSync(path);
    this.conn.exec("PRAGMA foreign_keys = ON;");
    this.conn.exec(SCHEMA);
  }

  close() {
    this.conn.close();
  }

  // ---- Investigations -------------------------------------------------
  createInvestigation(inv: Investigation) {
    const stmt = this.conn.prepare(
      `INSERT INTO investigations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
    );
    stmt.run(inv.id, inv.name, inv.createdAt, inv.updatedAt);
    for (const seed of inv.seeds) this.addSeed(seed);
  }

  touchInvestigation(id: string, updatedAt: string) {
    this.conn.prepare(`UPDATE investigations SET updated_at = ? WHERE id = ?`).run(updatedAt, id);
  }

  getInvestigation(id: string): Investigation | undefined {
    const row = this.conn.prepare(`SELECT * FROM investigations WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    const seeds = this.listSeeds(id);
    return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, seeds };
  }

  listInvestigations(): Investigation[] {
    const rows = this.conn.prepare(`SELECT * FROM investigations ORDER BY created_at DESC`).all() as any[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      seeds: this.listSeeds(row.id),
    }));
  }

  deleteInvestigation(id: string) {
    this.conn.prepare(`DELETE FROM remediation WHERE investigation_id = ?`).run(id);
    this.conn.prepare(`DELETE FROM research_log WHERE investigation_id = ?`).run(id);
    this.conn.prepare(`DELETE FROM findings WHERE investigation_id = ?`).run(id);
    this.conn.prepare(`DELETE FROM seeds WHERE investigation_id = ?`).run(id);
    this.conn.prepare(`DELETE FROM investigations WHERE id = ?`).run(id);
  }

  // ---- Seeds ------------------------------------------------------------
  addSeed(seed: Seed) {
    this.conn
      .prepare(`INSERT INTO seeds (id, investigation_id, type, value, label, added_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(seed.id, seed.investigationId, seed.type, seed.value, seed.label ?? null, seed.addedAt);
  }

  listSeeds(investigationId: string): Seed[] {
    const rows = this.conn
      .prepare(`SELECT * FROM seeds WHERE investigation_id = ? ORDER BY added_at ASC`)
      .all(investigationId) as any[];
    return rows.map((r) => ({
      id: r.id,
      investigationId: r.investigation_id,
      type: r.type,
      value: r.value,
      label: r.label ?? undefined,
      addedAt: r.added_at,
    }));
  }

  // ---- Findings -----------------------------------------------------------
  /** Insert or, on re-scan, update an existing finding by dedupe key while preserving remediation status. */
  upsertFinding(f: Finding) {
    const dedupeKey = f.dedupeKey || computeDedupeKey(f);
    const existing = this.conn.prepare(`SELECT id, status, first_observed_at FROM findings WHERE dedupe_key = ?`).get(dedupeKey) as any;

    if (existing) {
      this.conn
        .prepare(
          `UPDATE findings SET title=?, url=?, snippet=?, evidence=?, risk_level=?, identity_confidence=?,
           confidence_reason=?, last_observed_at=?, metadata=?, recommended_action=? WHERE id = ?`
        )
        .run(
          f.title ?? null,
          f.url ?? null,
          f.snippet ?? null,
          f.evidence,
          f.riskLevel,
          f.identityConfidence,
          f.confidenceReason,
          f.discoveredAt,
          JSON.stringify(f.metadata ?? {}),
          f.recommendedAction,
          existing.id
        );
      return existing.id as string;
    }

    this.conn
      .prepare(
        `INSERT INTO findings (id, investigation_id, seed_id, identifier_type, identifier_value, module, source,
          provider_mode, platform, title, url, snippet, evidence, exposure_type, risk_level, identity_confidence,
          confidence_reason, discovered_at, first_observed_at, last_observed_at, metadata, redacted, status,
          recommended_action, dedupe_key)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        f.id,
        f.investigationId,
        f.seedId,
        f.identifierType,
        f.identifierValue,
        f.module,
        f.source,
        f.providerMode,
        f.platform ?? null,
        f.title ?? null,
        f.url ?? null,
        f.snippet ?? null,
        f.evidence,
        f.exposureType,
        f.riskLevel,
        f.identityConfidence,
        f.confidenceReason,
        f.discoveredAt,
        f.firstObservedAt ?? f.discoveredAt,
        f.lastObservedAt ?? f.discoveredAt,
        JSON.stringify(f.metadata ?? {}),
        f.redacted ? 1 : 0,
        f.status,
        f.recommendedAction,
        dedupeKey
      );
    return f.id;
  }

  listFindings(investigationId: string): Finding[] {
    const rows = this.conn
      .prepare(`SELECT * FROM findings WHERE investigation_id = ? ORDER BY discovered_at DESC`)
      .all(investigationId) as any[];
    return rows.map(rowToFinding);
  }

  updateFindingStatus(findingId: string, status: RemediationStatus) {
    this.conn.prepare(`UPDATE findings SET status = ? WHERE id = ?`).run(status, findingId);
  }

  // ---- Research log -----------------------------------------------------
  addLogEntry(entry: ResearchLogEntry) {
    this.conn
      .prepare(
        `INSERT INTO research_log (id, investigation_id, timestamp, query, source, url, http_status, result,
          identifier_searched, module, confidence) VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        entry.id,
        entry.investigationId,
        entry.timestamp,
        entry.query,
        entry.source,
        entry.url ?? null,
        entry.httpStatus ?? null,
        entry.result,
        entry.identifierSearched,
        entry.module,
        entry.confidence
      );
  }

  listLogEntries(investigationId: string): ResearchLogEntry[] {
    const rows = this.conn
      .prepare(`SELECT * FROM research_log WHERE investigation_id = ? ORDER BY timestamp DESC`)
      .all(investigationId) as any[];
    return rows.map((r) => ({
      id: r.id,
      investigationId: r.investigation_id,
      timestamp: r.timestamp,
      query: r.query,
      source: r.source,
      url: r.url ?? undefined,
      httpStatus: r.http_status ?? undefined,
      result: r.result,
      identifierSearched: r.identifier_searched,
      module: r.module,
      confidence: r.confidence,
    }));
  }

  pruneResearchLog(retentionDays: number) {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    const result = this.conn.prepare(`DELETE FROM research_log WHERE timestamp < ?`).run(cutoff);
    return Number(result.changes ?? 0);
  }

  // ---- Remediation --------------------------------------------------------
  upsertRemediation(item: RemediationItem) {
    const existing = this.conn.prepare(`SELECT id FROM remediation WHERE finding_id = ?`).get(item.findingId) as any;
    if (existing) {
      this.conn
        .prepare(`UPDATE remediation SET action=?, status=?, updated_at=?, notes=? WHERE id = ?`)
        .run(item.action, item.status, item.updatedAt, item.notes ?? null, existing.id);
      return existing.id as string;
    }
    this.conn
      .prepare(
        `INSERT INTO remediation (id, investigation_id, finding_id, action, status, created_at, updated_at, notes)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(item.id, item.investigationId, item.findingId, item.action, item.status, item.createdAt, item.updatedAt, item.notes ?? null);
    return item.id;
  }

  listRemediation(investigationId: string): RemediationItem[] {
    const rows = this.conn
      .prepare(`SELECT * FROM remediation WHERE investigation_id = ? ORDER BY updated_at DESC`)
      .all(investigationId) as any[];
    return rows.map((r) => ({
      id: r.id,
      investigationId: r.investigation_id,
      findingId: r.finding_id,
      action: r.action,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      notes: r.notes ?? undefined,
    }));
  }
}

function rowToFinding(r: any): Finding {
  return {
    id: r.id,
    investigationId: r.investigation_id,
    seedId: r.seed_id,
    identifierType: r.identifier_type,
    identifierValue: r.identifier_value,
    module: r.module,
    source: r.source,
    providerMode: r.provider_mode,
    platform: r.platform ?? undefined,
    title: r.title ?? undefined,
    url: r.url ?? undefined,
    snippet: r.snippet ?? undefined,
    evidence: r.evidence,
    exposureType: r.exposure_type,
    riskLevel: r.risk_level,
    identityConfidence: r.identity_confidence,
    confidenceReason: r.confidence_reason,
    discoveredAt: r.discovered_at,
    firstObservedAt: r.first_observed_at ?? undefined,
    lastObservedAt: r.last_observed_at ?? undefined,
    metadata: JSON.parse(r.metadata || "{}"),
    redacted: Boolean(r.redacted),
    status: r.status,
    recommendedAction: r.recommended_action,
    dedupeKey: r.dedupe_key,
  };
}

let sharedDb: Db | undefined;
export function getDb(path = process.env.DFI_DB_PATH || "./data/dfi.sqlite"): Db {
  if (!sharedDb) sharedDb = new Db(path);
  return sharedDb;
}

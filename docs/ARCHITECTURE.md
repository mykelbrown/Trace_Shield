# Architecture

## Monorepo layout

```
apps/web              Next.js (App Router) dashboard + REST API routes
packages/core          Domain types, normalization, query generation,
                        redaction, dedup, correlation, risk scoring,
                        remediation, encryption, SQLite persistence
packages/providers      OSINT provider implementations + the investigation
                        orchestrator (packages/providers/src/investigation.ts)
packages/report         HTML report template + Playwright-based PDF renderer
packages/cli            `dfi` command-line interface
fixtures/               Fictional demo identity (Alex Morgan) used for tests
                        and first-run exploration — never real personal data
```

Packages are plain TypeScript source consumed directly (no separate build
step) by Next.js (`transpilePackages`), `tsx` (CLI), and Vitest (tests) — see
"Why no per-package build step" below.

## Investigation workflow (spec section 34)

```
USER INPUT (name/email/phone/address/username/domain/social/other)
    │
    ▼
NORMALIZATION            packages/core/src/normalize.ts
    │
    ▼
QUERY GENERATION          packages/core/src/query-gen.ts (used by search_engine
    │                     provider; other providers query their API directly)
    ▼
PROVIDER FAN-OUT           packages/providers/src/investigation.ts calls every
    │                       enabled provider that `.supports()` each seed type
    ▼
COLLECTION                 Finding[] + ResearchLogEntry[] + SourceUnavailable[]
    │
    ▼
DEDUPLICATION               packages/core/src/dedup.ts — merges by a stable
    │                       hash of (source, url, identifier, exposureType)
    ▼
PERSISTENCE                 packages/core/src/db.ts (SQLite via node:sqlite) —
    │                       re-scans update lastObservedAt, never duplicate rows,
    │                       and never reset a manually-set remediation status
    ▼
IDENTITY CORRELATION         packages/core/src/correlation.ts builds a graph:
    │                       Person → Seeds → Discovered entities → cross-linked
    │                       metadata (employer, university, alsoEmail, ...),
    │                       with confidence that rises only when independently
    │                       corroborated by more than one finding
    ▼
RISK ANALYSIS                packages/core/src/risk.ts — per-finding contribution
    │                       weighted by risk level × identity confidence,
    │                       mapped onto 5 named risk dimensions with a
    │                       saturating (asymptotic) 0–100 curve
    ▼
REMEDIATION                  packages/core/src/remediation.ts auto-creates an
    │                       OPEN remediation item per finding with a
    │                       category-specific recommended action
    ▼
REPORT / DASHBOARD            packages/report (HTML+PDF) and apps/web (live UI)
```

## Provider architecture (spec section 25)

Every provider implements `OsintProvider` (`packages/providers/src/types.ts`):

```ts
interface OsintProvider {
  name: string;
  module: InvestigationModule;
  requiresApiKey: boolean;
  isConfigured(): boolean;      // true when a live API key is present
  supports(seedType): boolean;
  search(seed, ctx): Promise<ProviderResult>;
}
```

Each provider's `search()` internally follows the same normalize/validate/score
pattern (spec section 25), implemented as shared helpers in
`packages/providers/src/helpers.ts`:

- **normalize()** — `normalizeFinding()` builds a well-formed `Finding`,
  applying secret redaction to any snippet/evidence text before it's ever
  stored, and auto-escalates risk to CRITICAL if a credential-shaped string
  is detected.
- **validate()** — `validateFinding()` drops findings with empty evidence,
  missing identifiers, or non-http(s) URLs.
- **score()** — risk level, per-finding, is set by the provider based on the
  exposure type; the *aggregate* score is computed platform-wide by
  `computeRiskScore()`.

When a provider has no API key configured, it degrades to a clearly-labeled
mock provider (`providerMode: "mock"`) rather than failing — this keeps the
whole pipeline (correlation, risk, reports) exercisable with zero
configuration. See `.env.example` for which providers need which key.

When a source blocks or cannot support automated access (e.g. X/Instagram/
TikTok profile checks — see `packages/providers/src/social.ts`), the
provider records a `SourceUnavailable` entry with a manual-verification URL
instead of attempting to circumvent the block.

## Data model

SQLite tables (`packages/core/src/db.ts`): `investigations`, `seeds`,
`findings`, `research_log`, `remediation`. All writes go through parameterized
prepared statements — no string-built SQL. `findings.dedupe_key` is a unique
index that makes re-scans idempotent (upsert-by-dedupe-key).

## Security-relevant design decisions

See `SECURITY.md` for the full threat model. Notable implementation points:

- **SSRF hardening**: `packages/providers/src/http-client.ts`'s `safeFetch()`
  requires an explicit per-call `allowedHosts` allow-list and rejects any
  other host or non-http(s) scheme before a request is made.
- **Secret redaction**: `packages/core/src/redaction.ts` pattern-matches
  common credential shapes (AWS keys, GitHub/Slack/Stripe tokens, JWTs,
  private-key blocks, password hashes, DB connection strings) and redacts
  them before storage — see `packages/providers/src/github.ts` for the code-
  search path that exercises this on real repository content.
- **XSS**: the HTML report (`packages/report/src/html-report.ts`) escapes
  all interpolated finding text; the dashboard is React, which escapes by
  default.
- **SQL injection**: all queries are parameterized (see `db.test.ts` for a
  regression test with a `DROP TABLE` payload as a finding value).

## Why no per-package build step

Packages ship TypeScript source directly (`"main": "src/index.ts"`) and are
consumed by tools that transpile on the fly: Next.js via `transpilePackages`,
`tsx` for the CLI, and Vitest for tests. This keeps the monorepo simple for a
single-operator local tool — there's no publishing story that would require
compiled `dist/` output. Relative imports inside packages intentionally omit
file extensions (`from "./risk"`, not `from "./risk.js"`) because Next's
Turbopack bundler does not apply Node's ESM `.js`→`.ts` extension-mapping
convention; omitting the extension lets every consumer's own resolver (bundler
or `tsc`'s `moduleResolution: "bundler"`) pick the right file.

# DFI — Digital Footprint Intelligence

A local-first, self-audit OSINT platform for understanding your own public
digital footprint: where your name, email, phone, address, usernames, and
social/professional profiles are publicly exposed; whether they appear in
reported data breaches; what an attacker could learn from that exposure; and
what to do about each finding.

**This is a self-audit tool.** It only investigates identifiers you
explicitly enter, never attempts to bypass authentication/CAPTCHAs/access
controls, never retrieves passwords or credentials, and never contacts
anyone it discovers. See `SECURITY.md` and `PRIVACY.md` for the full policy.

## Quick start

```bash
npm install
cp .env.example .env        # optional — every provider has a mock fallback
cp config.example.yaml config.yaml   # optional — sane defaults ship built-in
npm run dev
```

Open http://localhost:3000, enter identifiers that belong to you, and click
**Start Digital Footprint Investigation**. Or try the bundled fictional demo
identity first — see [Try the fictional demo](#try-the-fictional-demo-alex-morgan) below.

## What it investigates

| Module | What it checks | Provider(s) |
|---|---|---|
| Search engine intelligence | Name/email/phone/username/address mentions, document exposure (`filetype:pdf` etc.) | Brave Search API (mock fallback) |
| Breach exposure | Reported data breaches for an email | Have I Been Pwned API (mock fallback) |
| Code/repository exposure | Identifiers and potential leaked secrets in public repos | GitHub API |
| Username enumeration | Account existence across dev/social platforms | GitHub, GitLab, Dev.to, Stack Overflow, Keybase, Hacker News (live); X/Instagram/TikTok/Facebook/YouTube/Reddit are recorded as manual-verification-only — see below |
| Domain & DNS footprint | MX/TXT/NS/A/AAAA, SPF/DMARC, RDAP/WHOIS | Public DNS + rdap.org |
| Subdomain discovery | Certificate Transparency logs | crt.sh |
| Historical footprint | Archived snapshots of a domain or profile URL | Internet Archive Wayback Machine (CDX API) |

Every finding carries an **identity confidence** (HIGH/MEDIUM/LOW/UNKNOWN)
and a **risk level** (CRITICAL/HIGH/MEDIUM/LOW) — see `docs/ARCHITECTURE.md`
for how both are computed. Findings are correlated into an **identity graph**
and rolled up into 6 risk scores (Overall Exposure, Identity, Privacy, Social
Engineering, Account Takeover, Reputation), each 0–100.

### Why some findings say "[MOCK]" or "Source unavailable"

- **No API key configured** → that provider falls back to a clearly-labeled
  mock provider so the full pipeline (correlation/risk/report) is still
  exercisable. Add the relevant key from `.env.example` for live data.
- **Platform blocks automated access** (X, Instagram, TikTok, Facebook,
  Reddit's JSON endpoints, YouTube without a quota'd API key) → DFI does
  **not** attempt to circumvent this. It records a `SourceUnavailable` entry
  with a manual-verification link instead.

## API keys (all optional)

| Env var | Used for | Get one at |
|---|---|---|
| `BRAVE_SEARCH_API_KEY` | Search-engine intelligence | https://brave.com/search/api/ |
| `HIBP_API_KEY` | Breach checking | https://haveibeenpwned.com/API/Key |
| `GITHUB_TOKEN` | GitHub code search (username profile checks work without it) | https://github.com/settings/tokens |

See `.env.example` for the full list and `config.example.yaml` for
non-secret behavior toggles (which modules run, rate limits, retention).

## Try the fictional demo (Alex Morgan)

`fixtures/alex-morgan.json` is a completely fictional identity for exploring
the platform end-to-end without using real personal data:

```bash
curl -X POST http://localhost:3000/api/investigations \
  -H "Content-Type: application/json" \
  --data-binary @fixtures/alex-morgan.json
```

or via the CLI:

```bash
npm run cli -- scan --investigation "alex-morgan-demo" \
  --name "Alex Morgan" --email "alex.morgan@example.com" \
  --username "alexmorgan_test" --domain "example.com"
```

Then open the investigation in the dashboard to see the identity graph, risk
scores, findings table, timeline, and remediation tracker populated.

## CLI

```bash
npm run cli -- scan --email "you@example.com"
npm run cli -- scan --phone "+353000000000"
npm run cli -- scan --name "Your Name"
npm run cli -- scan --username "yourhandle"
npm run cli -- rescan --investigation default
npm run cli -- report --investigation default --format pdf
npm run cli -- list
```

Full reference: `docs/CLI.md`.

## Reports

Every investigation can generate a professional HTML or PDF report (Executive
Summary → Identity/Social/Professional/Address/Breach/Document/Code Exposure
→ Social Engineering Risk Analysis → Prioritized Recommended Actions) from
the dashboard (**HTML Report** / **Download PDF** buttons) or the CLI
(`dfi report`).

## Docker

```bash
cp .env.example .env
cp config.example.yaml config.yaml
docker compose up --build
```

Data persists in the `dfi-data`/`dfi-reports` named volumes. See the
`Dockerfile` for why the Playwright base image is used (PDF rendering needs a
real Chromium).

## Testing

```bash
npm test
```

74+ unit and integration tests across normalization, phone formatting,
redaction/secret-detection, deduplication, identity correlation, risk
scoring, report generation, SSRF hardening, and a full end-to-end
investigation run against deterministic mock providers with the fictional
Alex Morgan identity (`packages/providers/test/investigation.test.ts`). No
real personal data is used in any automated test.

## Project structure

```
apps/web              Next.js dashboard + REST API
packages/core          Types, normalization, correlation, risk scoring, DB
packages/providers      OSINT providers + investigation orchestrator
packages/report         HTML/PDF report generation
packages/cli            dfi CLI
fixtures/               Fictional demo identity
docs/                    ARCHITECTURE.md, CLI.md, TROUBLESHOOTING.md
```

Full architecture write-up: `docs/ARCHITECTURE.md`.
Security model: `SECURITY.md`. Data-handling policy: `PRIVACY.md`.
Troubleshooting: `docs/TROUBLESHOOTING.md`.

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite` module)
- No external database required — SQLite file at `DFI_DB_PATH` (default
  `./data/dfi.sqlite`)

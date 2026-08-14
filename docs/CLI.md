# CLI reference

The CLI (`dfi`) shares the same core/providers/report packages as the web
dashboard and writes to the same SQLite database (`DFI_DB_PATH`, default
`./data/dfi.sqlite`), so investigations started in one are visible in the
other.

Run it via the npm script (no global install needed):

```bash
npm run cli -- scan --email "you@example.com"
```

or directly with `tsx`:

```bash
npx tsx packages/cli/src/bin.ts scan --email "you@example.com"
```

## Commands

### `dfi scan`

Adds one or more identifiers to an investigation (creating it if needed) and
runs every enabled provider against the newly-added seeds.

```bash
dfi scan --investigation "personal-audit" \
  --name "Your Name" \
  --email "you@example.com" \
  --phone "+353000000000" \
  --username "yourhandle" \
  --address "1 Example Way, Dublin" \
  --domain "yourdomain.com"
```

Flags: `--investigation <name>` (default `default`), `--email`, `--phone`,
`--name`, `--username`, `--address`, `--domain`, `--all` (re-run every
provider against every existing seed instead of adding new ones).

### `dfi rescan`

Re-runs every provider against every seed already in an investigation —
useful for detecting new exposures or confirming an old one disappeared.
Re-scans never duplicate findings and never reset a remediation status you've
already set; they only update `lastObservedAt`.

```bash
dfi rescan --investigation "personal-audit"
```

### `dfi list`

Lists investigations with seed/finding counts and last-updated time.

```bash
dfi list
```

### `dfi report`

Generates an HTML or PDF report.

```bash
dfi report --investigation "personal-audit" --format pdf --out ./reports/generated/audit.pdf
```

Flags: `--investigation <name>`, `--format html|pdf` (default `html`),
`--out <path>` (default `./reports/generated/<name>-<timestamp>.<format>`).

## Configuration

The CLI reads `config.yaml` (see `config.example.yaml`) if present, and
`.env` for API keys (see `.env.example`). Both are optional — every provider
has a mock fallback.

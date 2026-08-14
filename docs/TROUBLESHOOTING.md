# Troubleshooting

### "SQLite is an experimental feature" warning

Expected — DFI uses Node's built-in `node:sqlite` module, unflagged since
Node 22.13 but still marked experimental by Node itself. It's safe to ignore;
it does not affect correctness. Requires **Node 22.13+** (check with
`node --version`; upgrade via [nvm](https://github.com/nvm-sh/nvm) or your
platform's package manager if you're on an older Node 22.x or Node 20).

### Findings all say "[MOCK]" / `providerMode: "mock"`

That provider has no API key configured, so it's using its bundled mock
provider instead of live data — this is intentional graceful degradation,
not a bug. Check `.env.example` for which key each provider needs (e.g.
`BRAVE_SEARCH_API_KEY`, `HIBP_API_KEY`, `GITHUB_TOKEN`), add it to your local
`.env`, and re-scan.

### "Source unavailable" entries for X/Instagram/TikTok/Facebook/Reddit/YouTube

Expected. These platforms actively block unauthenticated automated profile
checks; DFI does not attempt to circumvent that (see `SECURITY.md`). Each
entry includes a manual-verification URL — check it yourself while logged in.

### PDF report generation fails or hangs

The PDF renderer (`packages/report/src/pdf-report.ts`) uses Playwright's
Chromium. If it's not found at `/opt/pw-browsers/chromium` or via
`PLAYWRIGHT_CHROMIUM_PATH`, Playwright falls back to its normal browser
resolution — which requires Chromium to actually be installed
(`npx playwright install chromium`) unless you're running the Docker image
(which bundles it). If it hangs, check outbound network isn't blocked for
`about:blank`/local rendering — no network call is made for HTML you already
have in memory, so a hang usually means the Chromium binary itself failed to
launch (try adding `--no-sandbox`, already the default here, or check
container `--cap-add=SYS_ADMIN` isn't required in your environment).

### `npm run build -w apps/web` fails with a module-resolution error after editing a package

If you added a new relative import inside `packages/core|providers|report`,
omit the file extension (`from "./risk"`, not `from "./risk.js"`) — see
"Why no per-package build step" in `docs/ARCHITECTURE.md` for why.

### Vitest fails to import `node:sqlite`

If you see `Failed to load url sqlite` from Vitest specifically (not from
`next build` or `next dev`, which work fine), it's a known Vite 5 built-in-
module resolution gap for very new Node builtins — already worked around via
`vitest.sqlite-shim.ts` + the `resolve.alias` in `vitest.config.ts`. If you
hit a variant of this after a dependency upgrade, check whether a newer Vite
version fixes it natively and the shim can be removed.

### Web dashboard shows an empty investigation list after restarting

Check `DFI_DB_PATH` — if unset, it defaults to `./data/dfi.sqlite` relative
to wherever you launched the process from. Running `npm run dev` from the
repo root vs. `apps/web` will resolve to different files. Set
`DFI_DB_PATH` explicitly to an absolute path if you run commands from
different working directories.

### Rate limiting / "Request failed after N attempts"

Each provider backs off exponentially (`rate_limit.backoff_base_ms` in
`config.yaml`) and gives up after `max_retries`, recording a
`SourceUnavailable` entry rather than blocking the whole investigation.
Increase `request_timeout_ms` or lower `requests_per_second` in
`config.yaml` if you're hitting a strict upstream rate limit.

### I want to delete all local data

Stop the app and remove the `data/` directory (and `reports/generated/` if
you've generated reports). Both are gitignored and contain no data DFI needs
to function again from scratch — a fresh `data/dfi.sqlite` is created
automatically on next run.

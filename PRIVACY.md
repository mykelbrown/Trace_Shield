# Privacy Policy (for the DFI application itself)

DFI is built to investigate *your own* exposure without creating a new
exposure of its own. This document explains what the application does with
the data you give it.

## What DFI collects

Only what you type into the investigation form or CLI: names, email
addresses, phone numbers, addresses, usernames, domains, social profile
URLs, employer/university names, and any "other identifiers" you add. DFI
never collects data about anyone other than the identifiers you supply.

## What DFI does with it

1. Normalizes and validates each identifier.
2. Generates search queries and provider requests derived from them.
3. Sends those queries to the OSINT providers you have enabled (see
   `config.yaml` and `.env.example`) — and only those providers.
4. Stores results locally in a SQLite database under `data/` (gitignored,
   never transmitted anywhere by the app itself).
5. Runs correlation, deduplication, and risk-scoring entirely in-process
   on your machine.

## What DFI does not do

- No telemetry, analytics, or crash reporting is sent to the maintainers.
- No data is uploaded to any third party except the specific OSINT source
  APIs you configure, and only the minimal query text needed for that
  lookup (e.g., an email address sent to the breach-checking API).
- DFI never contacts, messages, or emails anyone discovered during an
  investigation. It has no outbound-messaging capability at all.
- DFI never stores passwords, password hashes, authentication tokens,
  private messages, or financial credentials, even if a provider's raw
  response happens to contain them — those fields are redacted before
  storage (see `SECURITY.md`).

## Retention and deletion

- The research log (every query/source/URL/result the app produced) is
  retained for `DFI_LOG_RETENTION_DAYS` (default 90) and then pruned
  automatically. Set to `0` to keep indefinitely.
- You can delete all local data at any time by removing the `data/`
  directory, or by using the dashboard's "Delete investigation" action,
  which is a hard delete (no soft-delete/undo, by design, since the point
  is that you control the data).

## Reports

Generated PDF/HTML reports are written to `reports/generated/` (gitignored)
and are never uploaded anywhere by DFI. Treat them as sensitive documents —
they summarize your own exposure and are handled the same way you would
handle a credit report or medical record.

## Third-party data

Findings surfaced by DFI originate from public sources you asked it to
query (search engines, certificate transparency logs, breach-notification
services, code hosting platforms, the Wayback Machine, and public social
profiles). DFI does not verify or endorse the accuracy of third-party data;
it presents it with a confidence rating so you can judge for yourself.

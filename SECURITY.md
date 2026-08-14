# Security Policy

## Scope and intent

Digital Footprint Intelligence (DFI) is a **local-first, self-audit** tool. It
is designed to be run by one person, against identifiers that person
explicitly supplies, to understand their own public exposure. It is not a
hacking tool, and the codebase intentionally has no code paths for:

- Authentication bypass, credential stuffing, or password recovery
- CAPTCHA circumvention
- Exploitation of vulnerabilities in third-party systems
- Retrieval or display of passwords, password hashes, API keys, tokens,
  session cookies, or private messages
- Access to non-public data stores, leak marketplaces, or credential dumps

If you find a code path that does any of the above, please treat it as a bug
and report it (see below) — it should be removed.

## Threat model

DFI stores data that is, by design, sensitive: a profile of one person's
public exposure is itself useful to an attacker. The application treats its
own local database as a high-value asset:

- **Local-first**: no telemetry, no third-party analytics, no data leaves the
  machine except outbound requests to the OSINT providers you enable.
- **Encryption at rest**: sensitive finding fields (raw evidence snippets,
  contact details) are encrypted with AES-256-GCM using a key derived from
  `DFI_ENCRYPTION_KEY` or a generated per-install key stored at
  `data/.dfi.key` (0600 permissions, gitignored).
- **Secret redaction**: any provider result that looks like a credential
  (API key, private key, JWT, password hash, connection string) is redacted
  before it is stored or displayed — only the *type* and *location* are kept.
- **No arbitrary code execution**: content returned by third-party OSINT
  sources (search results, repository contents, HTML pages) is never
  evaluated, executed, or passed to a shell. It is treated strictly as data.
- **SSRF hardening**: outbound provider requests are restricted to an
  allow-list of provider hostnames; user-supplied values are never used to
  construct request URLs to arbitrary hosts.
- **Input validation**: all identifiers are validated and normalized before
  use in queries; findings are parameterized into SQLite, never
  string-concatenated into SQL.

## Reporting a vulnerability

This is a personal/local tool distributed as source. If you find a security
issue (e.g., a redaction bypass, an SSRF vector, a SQL-injection path, or a
path-traversal bug in report generation), please open a private security
advisory on the repository, or contact the maintainer directly rather than
filing a public issue, so a fix can ship before details are public.

## Hardening checklist for operators

- Keep `.env` and `data/` out of version control (already gitignored).
- Set `DFI_ENCRYPTION_KEY` explicitly if you need reproducible restores
  across machines.
- Run `npm audit` periodically; CI runs it on every push.
- Do not expose the web dashboard (`apps/web`) on a public interface or
  behind a reverse proxy without adding your own authentication — it has
  no built-in multi-user auth because it is designed for single-operator
  local use.
- Rotate `GITHUB_TOKEN` / `HIBP_API_KEY` / `BRAVE_SEARCH_API_KEY` if you
  suspect they leaked; DFI never logs them, but always treat API keys as
  secrets in your own shell history and process list.

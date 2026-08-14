// Vitest-only shim for `node:sqlite`.
//
// node:sqlite is a very new Node built-in (unflagged in Node 22.13+) that
// isn't yet in Vite 5's internal builtin-module allow-list. Vite's resolver
// strips the "node:" prefix when it doesn't recognize a builtin, then tries
// to load a package literally named "sqlite" from node_modules — which
// doesn't exist, so the static `import ... from "node:sqlite"` fails only
// under Vitest. Next.js/Turbopack has no such issue and uses the real
// static import in packages/core/src/db.ts directly.
//
// This shim is wired in ONLY via vitest.config.ts's `resolve.alias`, so it
// never affects the production build. `createRequire` bypasses Vite's
// import-resolution pipeline entirely (it's a plain runtime function call),
// which sidesteps the bug.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sqlite = require("node:sqlite");

export const DatabaseSync = sqlite.DatabaseSync;
export const StatementSync = sqlite.StatementSync;

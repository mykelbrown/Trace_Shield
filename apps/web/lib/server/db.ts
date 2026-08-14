import "server-only";
import { Db, DEFAULT_CONFIG, loadConfig, type DfiConfig } from "@dfi/core";

let db: Db | undefined;
export function getServerDb(): Db {
  if (!db) db = new Db(process.env.DFI_DB_PATH || "./data/dfi.sqlite");
  return db;
}

let config: DfiConfig | undefined;
export function getServerConfig(): DfiConfig {
  if (!config) config = loadConfig(process.env.DFI_CONFIG_PATH || "./config.yaml") ?? DEFAULT_CONFIG;
  return config;
}

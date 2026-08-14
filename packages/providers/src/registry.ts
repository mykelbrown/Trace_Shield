import type { DfiConfig } from "@dfi/core";
import type { OsintProvider } from "./types";
import { searchEngineProvider } from "./search_engine";
import { breachCheckerProvider } from "./breach_checker";
import { githubProvider } from "./github";
import { dnsProvider } from "./dns";
import { certificateTransparencyProvider } from "./certificate_transparency";
import { webArchiveProvider } from "./web_archive";
import { socialProvider } from "./social";

export const ALL_PROVIDERS: OsintProvider[] = [
  searchEngineProvider,
  breachCheckerProvider,
  githubProvider,
  dnsProvider,
  certificateTransparencyProvider,
  webArchiveProvider,
  socialProvider,
];

const CONFIG_GATE: Record<string, keyof DfiConfig["investigation"]> = {
  brave_search: "search_engines",
  hibp: "breach_checks",
  github: "github_search",
  dns_public_records: "dns_search",
  "crt.sh": "certificate_transparency",
  wayback_machine: "archive_search",
  social_username_enum: "social_search",
};

export function enabledProviders(config: DfiConfig): OsintProvider[] {
  return ALL_PROVIDERS.filter((p) => {
    const gate = CONFIG_GATE[p.name];
    return gate ? config.investigation[gate] : true;
  });
}

import type { InvestigationModule, ProviderContext, ProviderResult, Seed, SeedType } from "@dfi/core";

export interface OsintProvider {
  /** Machine name used as `Finding.source`, e.g. "brave_search", "hibp". */
  name: string;
  /** Human label for the UI / research log. */
  label: string;
  module: InvestigationModule;
  requiresApiKey: boolean;
  /** True when a live API key/credential is present; false means the mock provider will answer instead. */
  isConfigured(): boolean;
  supports(seedType: SeedType): boolean;
  search(seed: Seed, ctx: ProviderContext): Promise<ProviderResult>;
}

export function emptyResult(): ProviderResult {
  return { findings: [], logEntries: [], unavailable: [] };
}

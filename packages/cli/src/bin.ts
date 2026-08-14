#!/usr/bin/env node
import { Command } from "commander";
import { writeFileSync } from "node:fs";
import {
  Db,
  DEFAULT_CONFIG,
  loadConfig,
  newId,
  type Investigation,
  type Seed,
  type SeedType,
} from "@dfi/core";
import { runInvestigation } from "@dfi/providers";
import { generateHtmlReport, renderHtmlToPdf } from "@dfi/report";

const program = new Command();
program.name("dfi").description("Digital Footprint Intelligence — personal OSINT exposure audit CLI").version("0.1.0");

function getDb(): Db {
  return new Db(process.env.DFI_DB_PATH || "./data/dfi.sqlite");
}

function getOrCreateInvestigation(db: Db, name: string): Investigation {
  const existing = db.listInvestigations().find((i) => i.name === name);
  if (existing) return existing;
  const now = new Date().toISOString();
  const inv: Investigation = { id: newId("inv"), name, createdAt: now, updatedAt: now, seeds: [] };
  db.createInvestigation(inv);
  return inv;
}

function addSeedIfNew(db: Db, inv: Investigation, type: SeedType, value: string, label?: string): string {
  const existing = inv.seeds.find((s) => s.type === type && s.value === value);
  if (existing) return existing.id;
  const seed: Seed = { id: newId("seed"), investigationId: inv.id, type, value, label, addedAt: new Date().toISOString() };
  db.addSeed(seed);
  inv.seeds.push(seed);
  return seed.id;
}

function printSummary(risk: { exposureScore: number; counts: { critical: number; high: number; medium: number; low: number } }, label: string) {
  console.log(`\n${label}`);
  console.log(`  Overall Exposure Score: ${risk.exposureScore}/100`);
  console.log(`  Critical: ${risk.counts.critical}  High: ${risk.counts.high}  Medium: ${risk.counts.medium}  Low: ${risk.counts.low}\n`);
}

program
  .command("scan")
  .description("Run an investigation against one or more identifiers")
  .option("--investigation <name>", "Investigation name (created if it doesn't exist)", "default")
  .option("--email <value>", "Email address to investigate")
  .option("--phone <value>", "Phone number to investigate")
  .option("--name <value>", "Full name to investigate")
  .option("--username <value>", "Username to investigate")
  .option("--address <value>", "Address to investigate")
  .option("--domain <value>", "Domain to investigate")
  .option("--all", "Re-run every provider against every existing seed in the investigation")
  .action(async (opts) => {
    const db = getDb();
    const config = loadConfig(process.env.DFI_CONFIG_PATH || "./config.yaml") ?? DEFAULT_CONFIG;
    const inv = getOrCreateInvestigation(db, opts.investigation);

    const newSeedIds: string[] = [];
    const map: [SeedType, string | undefined][] = [
      ["email", opts.email],
      ["phone", opts.phone],
      ["name", opts.name],
      ["username", opts.username],
      ["address", opts.address],
      ["domain", opts.domain],
    ];
    for (const [type, value] of map) {
      if (value) newSeedIds.push(addSeedIfNew(db, inv, type, value));
    }

    if (newSeedIds.length === 0 && !opts.all) {
      console.error("No identifiers supplied. Use --email/--phone/--name/--username/--address/--domain, or --all to re-scan every existing seed.");
      process.exitCode = 1;
      db.close();
      return;
    }

    console.log(`Running investigation "${inv.name}" (${opts.all ? "all seeds" : `${newSeedIds.length} new seed(s)`})...`);
    const result = await runInvestigation(db, inv, config, opts.all ? {} : { seedIds: newSeedIds });
    printSummary(result.risk, `Investigation: ${inv.name}`);
    if (result.unavailable.length > 0) {
      console.log(`Sources unavailable (${result.unavailable.length}) — see research log for manual-verification steps.`);
    }
    db.close();
  });

program
  .command("rescan")
  .description("Re-run all providers against every seed in an investigation to detect changes since the last scan")
  .option("--investigation <name>", "Investigation name", "default")
  .action(async (opts) => {
    const db = getDb();
    const config = loadConfig(process.env.DFI_CONFIG_PATH || "./config.yaml") ?? DEFAULT_CONFIG;
    const inv = db.listInvestigations().find((i) => i.name === opts.investigation);
    if (!inv) {
      console.error(`No investigation named "${opts.investigation}" found. Run "dfi scan" first.`);
      process.exitCode = 1;
      db.close();
      return;
    }
    console.log(`Re-scanning "${inv.name}" (${inv.seeds.length} seed(s))...`);
    const result = await runInvestigation(db, inv, config);
    printSummary(result.risk, `Investigation: ${inv.name}`);
    db.close();
  });

program
  .command("list")
  .description("List investigations")
  .action(() => {
    const db = getDb();
    for (const inv of db.listInvestigations()) {
      const findings = db.listFindings(inv.id);
      console.log(`${inv.name}  (${inv.seeds.length} seeds, ${findings.length} findings, updated ${inv.updatedAt})`);
    }
    db.close();
  });

program
  .command("report")
  .description("Generate an HTML/PDF report for an investigation")
  .option("--investigation <name>", "Investigation name", "default")
  .option("--format <format>", "html or pdf", "html")
  .option("--out <path>", "Output file path")
  .action(async (opts) => {
    const db = getDb();
    const config = loadConfig(process.env.DFI_CONFIG_PATH || "./config.yaml") ?? DEFAULT_CONFIG;
    const inv = db.listInvestigations().find((i) => i.name === opts.investigation);
    if (!inv) {
      console.error(`No investigation named "${opts.investigation}" found.`);
      process.exitCode = 1;
      db.close();
      return;
    }
    const { computeRiskScore, socialEngineeringAnalysis } = await import("@dfi/core");
    const findings = db.listFindings(inv.id);
    const risk = computeRiskScore(findings, config);
    const socialEngineering = socialEngineeringAnalysis(findings);
    const html = generateHtmlReport({ investigation: inv, findings, risk, socialEngineering, generatedAt: new Date().toISOString() });

    const outPath = opts.out || `./reports/generated/${inv.name}-${Date.now()}.${opts.format}`;
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(outPath), { recursive: true });

    if (opts.format === "pdf") {
      const pdf = await renderHtmlToPdf(html);
      writeFileSync(outPath, pdf);
    } else {
      writeFileSync(outPath, html, "utf-8");
    }
    console.log(`Report written to ${outPath}`);
    db.close();
  });

program.parseAsync(process.argv);

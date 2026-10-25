#!/usr/bin/env bun
// sbomer <setup|scan|pick|inspect|down>
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { config, ROOT } from "./config";
import { installTool } from "./tools";
import { up, down } from "./stack";
import { checkout } from "./clone";
import { scanDeps, type Bom } from "./layers/deps";
import { gaps, purlTypes } from "./inspect";
import { pick } from "./pick";
import * as dt from "./dt";

type Target = { repo?: string; path?: string; ref?: string; shape?: string };

function targetsFile(): string {
  return join(ROOT, config().scan.targets_file);
}

function loadTargets(): Target[] {
  return (Bun.YAML.parse(readFileSync(targetsFile(), "utf8")) as { targets: Target[] }).targets;
}

function label(t: Target): string {
  return t.repo ?? t.path ?? "?";
}

function bomPath(project: string): string {
  return join(ROOT, config().scan.work_dir, "boms", `${project}.json`);
}

async function resolveTarget(t: Target): Promise<{ dir: string; project: string; version: string }> {
  if (t.repo) {
    const co = await checkout(t.repo, t.ref ?? "main");
    return { dir: co.dir, project: t.repo, version: co.sha };
  }
  // Local fixtures are versioned by the sbomer commit that holds them.
  const sha = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: ROOT }).stdout.toString().trim() || "local";
  return { dir: resolve(ROOT, t.path!), project: `sbomer/${t.path}`, version: sha };
}

async function scan(t: Target): Promise<void> {
  const started = Date.now();
  const { dir, project, version } = await resolveTarget(t);
  const bom = await scanDeps(dir);
  const out = bomPath(project);
  await mkdir(dirname(out), { recursive: true });
  await Bun.write(out, JSON.stringify(bom));
  const token = await dt.uploadBom(project, version, bom);
  await dt.waitForBom(token);
  const p = await dt.lookupProject(project, version);
  const count = await dt.componentCount(p.uuid);
  const types = [...purlTypes(bom)].map(([k, v]) => `${k}=${v}`).join(" ");
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${project}@${version.slice(0, 12)}  dt_components=${count}  ${types}  (${secs}s)`);
}

async function inspect(t: Target): Promise<void> {
  const { dir, project } = await resolveTarget(t);
  const file = bomPath(project);
  if (!existsSync(file)) throw new Error(`no BOM for ${project}; scan it first`);
  const bom = (await Bun.file(file).json()) as Bom;
  const { gaps: missing, covered } = gaps(dir, bom);
  console.log(`${project}`);
  for (const g of covered) console.log(`  ok   ${g.ecosystem}: ${g.manifests} manifests, ${g.components} components`);
  for (const g of missing) console.log(`  GAP  ${g.ecosystem}: ${g.manifests} manifests, 0 components  e.g. ${g.sample.join(", ")}`);
  if (missing.length) process.exitCode = 3;
}

// Targets named on the command line: matrix entries by label, or any owner/repo[@ref] ad hoc.
function selectTargets(args: string[]): Target[] {
  const targets = loadTargets();
  if (args.includes("--all")) return targets;
  return args.map((a) => {
    const known = targets.find((t) => label(t) === a);
    if (known) return known;
    const [repo, ref] = a.split("@");
    if (/^[\w.-]+\/[\w.-]+$/.test(repo!)) return { repo, ref };
    throw new Error(`unknown target ${a}; known: ${targets.map(label).join(", ")}`);
  });
}

async function each(targets: Target[], fn: (t: Target) => Promise<void>): Promise<void> {
  let failed = 0;
  for (const t of targets) {
    try {
      await fn(t);
    } catch (e) {
      failed++;
      console.error(`${label(t)}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (failed) process.exitCode = 1;
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "setup": {
      await installTool("syft");
      await up();
      await dt.bootstrap();
      const { ui_port, api_port } = config().stack;
      console.log(`ready: UI http://127.0.0.1:${ui_port}  API http://127.0.0.1:${api_port}`);
      return;
    }
    case "down":
      await down();
      return;
    case "scan":
      return each(selectTargets(rest), scan);
    case "inspect":
      return each(selectTargets(rest), inspect);
    case "pick": {
      // Appends the pick to targets.yaml so the matrix grows in public with each loop iteration.
      const lang = rest.find((a) => !a.startsWith("--"));
      const p = await pick(lang);
      if (!rest.includes("--dry-run")) {
        await appendFile(targetsFile(), `  - repo: ${p.repo}\n    ref: ${p.ref}\n    shape: loop pick (${p.language})\n`);
      }
      console.log(JSON.stringify(p));
      return;
    }
    default:
      console.error("usage: sbomer <setup | scan <target...>|--all | inspect <target...> | pick [language] [--dry-run] | down>");
      process.exit(2);
  }
}

await main(process.argv.slice(2));

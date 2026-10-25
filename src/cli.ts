#!/usr/bin/env bun
// sbomer <setup|scan|down>
import { join, resolve } from "node:path";
import { config, ROOT } from "./config";
import { installTool } from "./tools";
import { up, down } from "./stack";
import { checkout } from "./clone";
import { scanDeps } from "./layers/deps";
import * as dt from "./dt";

type Target = { repo?: string; path?: string; ref?: string; shape?: string };

async function loadTargets(): Promise<Target[]> {
  const doc = Bun.YAML.parse(await Bun.file(join(ROOT, config().scan.targets_file)).text()) as { targets: Target[] };
  return doc.targets;
}

function label(t: Target): string {
  return t.repo ?? t.path ?? "?";
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
  const token = await dt.uploadBom(project, version, bom);
  await dt.waitForBom(token);
  const p = await dt.lookupProject(project, version);
  const count = await dt.componentCount(p.uuid);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`${project}@${version.slice(0, 12)}  components=${count}  (${secs}s)`);
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
    case "scan": {
      const targets = await loadTargets();
      const picked = rest.includes("--all") ? targets : targets.filter((t) => rest.includes(label(t)));
      if (picked.length === 0) throw new Error(`no matching targets; known: ${targets.map(label).join(", ")}`);
      let failed = 0;
      for (const t of picked) {
        try {
          await scan(t);
        } catch (e) {
          failed++;
          console.error(`${label(t)}: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (failed) process.exit(1);
      return;
    }
    default:
      console.error("usage: sbomer <setup|scan <target...>|scan --all|down>");
      process.exit(2);
  }
}

await main(process.argv.slice(2));

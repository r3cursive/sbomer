// Unlocked Python: syft skips requirements without an exact pin, so an unlocked project shows zero components.
// This resolves each unlocked requirements file the way a fresh install would today, with `uv pip compile
// --no-build`, which reads package metadata only and never runs package code. Components are tagged
// sbomer:resolution=resolved so nobody mistakes them for a lockfile.
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifestsIn } from "../inspect";
import type { Bom } from "./deps";

const PY_LOCKFILES = /(^|\/)(uv\.lock|poetry\.lock|Pipfile\.lock|pdm\.lock)$/;
const REQUIREMENTS = /(^|\/)requirements[^/]*\.txt$/;

// A requirements file is unlocked when any requirement line lacks an exact `==` pin.
export function isUnlocked(text: string): boolean {
  return text
    .split("\n")
    .map((l) => l.replace(/#.*/, "").trim())
    .filter((l) => l && !l.startsWith("-"))
    .some((l) => !/==\s*[\w.*+!-]+/.test(l.split(";")[0]!));
}

// Files to resolve: unlocked requirements files, but only when the repo has no Python lockfile at all.
export function unlockedRequirements(dir: string): string[] {
  const py = manifestsIn(dir).get("pypi") ?? [];
  if (py.some((f) => PY_LOCKFILES.test(f))) return [];
  return py.filter((f) => REQUIREMENTS.test(f) && isUnlocked(readFileSync(join(dir, f), "utf8")));
}

type Component = { "bom-ref"?: string; type: string; name: string; version: string; purl: string; properties: { name: string; value: string }[] };

export function parseCompiled(text: string, source: string): Component[] {
  const out: Component[] = [];
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;]+)/.exec(line.trim());
    if (!m) continue;
    const name = m[1]!.toLowerCase().replace(/[._]+/g, "-");
    out.push({
      "bom-ref": `sbomer-resolved:${source}:${name}`,
      type: "library",
      name,
      version: m[2]!,
      purl: `pkg:pypi/${name}@${m[2]}`,
      properties: [
        { name: "sbomer:resolution", value: "resolved" },
        { name: "sbomer:source", value: source },
      ],
    });
  }
  return out;
}

export async function resolvePython(dir: string): Promise<{ components: Component[]; failed: string[] }> {
  const files = unlockedRequirements(dir);
  if (!files.length || !Bun.which("uv")) return { components: [], failed: files.length ? ["uv not installed"] : [] };
  const tmp = await mkdtemp(join(tmpdir(), "sbomer-uv-"));
  const components: Component[] = [];
  const failed: string[] = [];
  try {
    for (const f of files) {
      const out = join(tmp, "out.txt");
      // cwd is the scratch dir, never the clone, so no project config inside the repo is picked up.
      const p = Bun.spawnSync(
        ["uv", "pip", "compile", "--no-build", "--universal", "--no-header", "--no-annotate", "--no-config", "-q",
          "-o", out, join(dir, f)],
        { cwd: tmp, stdout: "pipe", stderr: "pipe", env: { ...process.env, UV_NO_CONFIG: "1" } },
      );
      if (p.exitCode !== 0 || !existsSync(out)) {
        failed.push(`${f}: ${p.stderr.toString().trim().split("\n").pop()}`);
        continue;
      }
      components.push(...parseCompiled(readFileSync(out, "utf8"), f));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { components, failed };
}

export function addComponents(bom: Bom, extra: Component[]): Bom {
  return { ...bom, components: [...(bom.components ?? []), ...extra] };
}

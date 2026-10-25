// Compares what a BOM caught against the manifests present in the repo, so gaps are visible per ecosystem.
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { config } from "./config";
import type { Bom } from "./layers/deps";

// Manifest file → the purl type syft should produce for it.
export const MANIFESTS: [RegExp, string][] = [
  [/^go\.mod$/, "golang"],
  [/^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|package\.json)$/, "npm"],
  [/^(requirements[^/]*\.txt|poetry\.lock|uv\.lock|Pipfile\.lock|pyproject\.toml|setup\.py)$/, "pypi"],
  [/^(pom\.xml|build\.gradle(\.kts)?|gradle\.lockfile|versions\.lock)$/, "maven"],
  [/^Cargo\.lock$/, "cargo"],
  [/^(composer\.lock|composer\.json)$/, "composer"],
  [/^Gemfile\.lock$/, "gem"],
  [/^(packages\.lock\.json|.*\.csproj|packages\.config)$/, "nuget"],
  [/^(Dockerfile[^/]*|.*\.dockerfile)$/, "docker (stage 2)"],
  [/^(docker-)?compose[^/]*\.ya?ml$/, "compose (stage 2)"],
];

const SKIP_DIRS = new Set([".git", "node_modules", "vendor", "target", "dist", "build", ".venv"]);

export function isExcluded(rel: string, globs: string[] = config().scan.exclude): boolean {
  return globs.some((g) => new Bun.Glob(g).match(rel));
}

export function manifestsIn(dir: string, globs: string[] = config().scan.exclude): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(p);
        continue;
      }
      if (isExcluded(relative(dir, p), globs)) continue;
      for (const [re, type] of MANIFESTS) {
        if (re.test(name)) {
          const list = found.get(type) ?? [];
          list.push(relative(dir, p));
          found.set(type, list);
          break;
        }
      }
    }
  };
  walk(dir);
  return found;
}

export function purlTypes(bom: Bom): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of (bom.components ?? []) as { purl?: string }[]) {
    if (c.purl && TOOLING.some((re) => re.test(c.purl!))) continue;
    const type = /^pkg:([^/]+)\//.exec(c.purl ?? "")?.[1] ?? "(no purl)";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return counts;
}

export type Gap = { ecosystem: string; manifests: number; components: number; sample: string[]; reason?: string };

// Build tooling syft reports in place of real dependencies. Counting it would hide an unresolved build.
const TOOLING = [/^pkg:maven\/org\.gradle\.wrapper\b/];

// Gradle and Maven builds only resolve to components when a lockfile pins them.
const JVM_LOCKFILE = /(^|\/)(gradle\.lockfile|versions\.lock|pom\.xml)$/;

// An ecosystem is a gap when the repo declares manifests for it but the BOM holds no components of that type,
// or when it's a JVM build with no lockfile, which syft can't resolve without running the build.
export function gaps(dir: string, bom: Bom): { gaps: Gap[]; covered: Gap[] } {
  const man = manifestsIn(dir);
  const types = purlTypes(bom);
  const rows: Gap[] = [...man.entries()].map(([eco, files]) => {
    const row: Gap = {
      ecosystem: eco,
      manifests: files.length,
      components: types.get(eco.split(" ")[0]!) ?? 0,
      sample: files.slice(0, 3),
    };
    if (eco.includes("stage 2")) return row;
    if (row.components === 0) row.reason = "no components";
    else if (eco === "maven" && !files.some((f) => JVM_LOCKFILE.test(f))) row.reason = "build files without a lockfile";
    return row;
  });
  return { gaps: rows.filter((r) => r.reason), covered: rows.filter((r) => !r.reason) };
}

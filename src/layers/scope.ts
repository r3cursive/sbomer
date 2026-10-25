// Tags npm components that only dev installs pull in, using the `dev: true` flags in package-lock v2/v3.
// syft is told to include dev dependencies (scan.include_dev_dependencies); this keeps them distinguishable.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manifestsIn } from "../inspect";
import type { Bom } from "./deps";

type Lock = { packages?: Record<string, { name?: string; version?: string; dev?: boolean; devOptional?: boolean }> };

// name@version keys for every dev-only package in a lockfile. Paths look like node_modules/@scope/name.
export function devKeys(lock: Lock): Set<string> {
  const keys = new Set<string>();
  for (const [path, p] of Object.entries(lock.packages ?? {})) {
    if (!path || !(p.dev || p.devOptional) || !p.version) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    keys.add(`${name}@${p.version}`);
  }
  return keys;
}

type Component = { name?: string; group?: string; version?: string; purl?: string; properties?: { name: string; value: string }[] };

// A package that is dev in one lockfile but runtime in another stays runtime: only tag it when no lockfile needs it at runtime.
export function tagDev(bom: Bom, dir: string): { bom: Bom; tagged: number } {
  const locks = (manifestsIn(dir).get("npm") ?? []).filter((f) => f.endsWith("package-lock.json"));
  const dev = new Set<string>();
  const runtime = new Set<string>();
  for (const f of locks) {
    const lock = JSON.parse(readFileSync(join(dir, f), "utf8")) as Lock;
    const d = devKeys(lock);
    for (const k of d) dev.add(k);
    for (const [path, p] of Object.entries(lock.packages ?? {})) {
      if (!path || !p.version) continue;
      const k = `${path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length)}@${p.version}`;
      if (!d.has(k)) runtime.add(k);
    }
  }
  let tagged = 0;
  const components = ((bom.components ?? []) as Component[]).map((c) => {
    if (!c.purl?.startsWith("pkg:npm/")) return c;
    const name = c.group ? `${c.group}/${c.name}` : c.name;
    const key = `${name}@${c.version}`;
    if (!dev.has(key) || runtime.has(key)) return c;
    tagged++;
    return { ...c, properties: [...(c.properties ?? []), { name: "sbomer:scope", value: "dev" }] };
  });
  return { bom: { ...bom, components }, tagged };
}

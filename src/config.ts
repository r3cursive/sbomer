// Loads sbomer.yaml, then deep-merges sbomer.local.yaml over it when present.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");

export type Config = {
  stack: {
    network: string;
    api_port: number;
    ui_port: number;
    images: { postgres: string; apiserver: string; frontend: string };
  };
  sources: { osv: { enabled: boolean; ecosystems: string[] } };
  scan: { targets_file: string; work_dir: string; bom_wait_seconds: number; resolve_unlocked_python: boolean };
  loop: { languages: string[]; min_stars: number; pushed_within_days: number };
};

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over ?? base) as T;
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? merge(out[k], v) : v;
  return out as T;
}

function readYaml(path: string): unknown {
  return Bun.YAML.parse(readFileSync(path, "utf8"));
}

let cached: Config | undefined;

export function config(): Config {
  if (cached) return cached;
  let cfg = readYaml(join(ROOT, "sbomer.yaml")) as Config;
  const local = join(ROOT, "sbomer.local.yaml");
  if (existsSync(local)) cfg = merge(cfg, readYaml(local));
  cached = cfg;
  return cfg;
}

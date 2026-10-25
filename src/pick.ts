// Picks a random public repo for the improvement loop, favouring languages recent postmortems haven't covered.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config, ROOT } from "./config";
import { run } from "./tools";

export type Pick = { repo: string; ref: string; language: string };

type Candidate = { fullName: string; defaultBranch: string; isFork: boolean; stargazersCount: number; createdAt: string };

// Rejects forks, already-scanned repos, and repos whose age or star velocity suggests bought stars.
export function plausible(c: Candidate, now: number, minAgeDays: number, maxStarsPerDay: number): boolean {
  if (c.isFork) return false;
  const ageDays = (now - Date.parse(c.createdAt)) / 86_400_000;
  if (ageDays < minAgeDays) return false;
  return c.stargazersCount / ageDays <= maxStarsPerDay;
}

function recentLanguages(n: number): string[] {
  const dir = join(ROOT, "docs", "postmortems");
  const files = readdirSync(dir).filter((f) => /^\d{3}-.*\.md$/.test(f)).sort().slice(-n);
  return files.map((f) => /^# \d{3}: .*?\(([^,)]+)/m.exec(readFileSync(join(dir, f), "utf8"))?.[1]?.trim() ?? "");
}

function seen(): Set<string> {
  const doc = Bun.YAML.parse(readFileSync(join(ROOT, config().scan.targets_file), "utf8")) as { targets: { repo?: string }[] };
  return new Set(doc.targets.map((t) => t.repo?.toLowerCase()).filter(Boolean) as string[]);
}

export async function pick(language?: string): Promise<Pick> {
  const { languages, min_stars, pushed_within_days, min_age_days, max_stars_per_day } = config().loop;
  const recent = new Set(recentLanguages(languages.length - 1));
  const pool = languages.filter((l) => !recent.has(l));
  const lang = language ?? (pool.length ? pool : languages)[Math.floor(Math.random() * (pool.length || languages.length))]!;
  const since = new Date(Date.now() - pushed_within_days * 86_400_000).toISOString().slice(0, 10);
  const out = await run([
    "gh", "search", "repos", "--language", lang, "--stars", `>=${min_stars}`, "--updated", `>=${since}`,
    "--archived=false", "--limit", "100", "--json", "fullName,defaultBranch,isFork,stargazersCount,createdAt",
  ]);
  const skip = seen();
  const now = Date.now();
  const candidates = (JSON.parse(out) as Candidate[])
    .filter((r) => !skip.has(r.fullName.toLowerCase()) && plausible(r, now, min_age_days, max_stars_per_day));
  if (!candidates.length) throw new Error(`no candidates for ${lang}`);
  const r = candidates[Math.floor(Math.random() * candidates.length)]!;
  return { repo: r.fullName, ref: r.defaultBranch, language: lang };
}

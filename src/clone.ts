// Shallow clones into work/repos/<owner>/<name>. Re-scans fetch the ref again instead of re-cloning.
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config, ROOT } from "./config";
import { run } from "./tools";

const WORK = join(ROOT, config().scan.work_dir, "repos");

export type Checkout = { dir: string; sha: string };

export async function checkout(repo: string, ref: string): Promise<Checkout> {
  const dir = join(WORK, repo);
  if (!existsSync(join(dir, ".git"))) {
    await mkdir(dir, { recursive: true });
    await run(["git", "clone", "--quiet", "--depth", "1", "--branch", ref, `https://github.com/${repo}.git`, dir]);
  } else {
    await run(["git", "fetch", "--quiet", "--depth", "1", "origin", ref], { cwd: dir });
    await run(["git", "checkout", "--quiet", "--force", "FETCH_HEAD"], { cwd: dir });
  }
  const sha = (await run(["git", "rev-parse", "HEAD"], { cwd: dir })).trim();
  return { dir, sha };
}

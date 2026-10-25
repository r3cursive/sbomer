// Layer 1: dependencies declared in lockfiles and manifests, catalogued by syft.
import { config } from "../config";
import { installTool, run } from "../tools";

export type Bom = { bomFormat: "CycloneDX"; specVersion: string; components?: unknown[]; [k: string]: unknown };

export async function scanDeps(dir: string): Promise<Bom> {
  const syft = await installTool("syft");
  // syft matches --exclude against paths relative to the scan root, which need a leading "./".
  const excludes = config().scan.exclude.flatMap((g) => ["--exclude", g.startsWith("**") ? `./${g}` : g]);
  const out = await run([syft, "scan", `dir:${dir}`, "-o", "cyclonedx-json", "-q", ...excludes]);
  return JSON.parse(out) as Bom;
}

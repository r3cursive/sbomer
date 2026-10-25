// Layer 1: dependencies declared in lockfiles and manifests, catalogued by syft.
import { installTool, run } from "../tools";

export type Bom = { bomFormat: "CycloneDX"; specVersion: string; components?: unknown[]; [k: string]: unknown };

export async function scanDeps(dir: string): Promise<Bom> {
  const syft = await installTool("syft");
  const out = await run([syft, "scan", `dir:${dir}`, "-o", "cyclonedx-json", "-q"]);
  return JSON.parse(out) as Bom;
}

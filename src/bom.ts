// Cleans syft's CycloneDX before upload: drops components Dependency-Track can never match.
import type { Bom } from "./layers/deps";

type Component = { "bom-ref"?: string; type?: string; name?: string; purl?: string };
type Dependency = { ref: string; dependsOn?: string[] };

// Unmatchable: file entries (syft's file catalog) and repo-local GitHub Actions (`./.github/actions/x`),
// which syft lists once per workflow that uses them and which carry no purl.
export function isNoise(c: Component): boolean {
  if (c.type === "file") return true;
  if (!c.purl && c.name?.startsWith("./")) return true;
  return false;
}

export function normalize(bom: Bom): { bom: Bom; dropped: number } {
  const components = (bom.components ?? []) as Component[];
  const keep = components.filter((c) => !isNoise(c));
  const gone = new Set(components.filter(isNoise).map((c) => c["bom-ref"]).filter(Boolean));
  const deps = ((bom.dependencies ?? []) as Dependency[])
    .filter((d) => !gone.has(d.ref))
    .map((d) => (d.dependsOn ? { ...d, dependsOn: d.dependsOn.filter((r) => !gone.has(r)) } : d));
  return { bom: { ...bom, components: keep, dependencies: deps }, dropped: components.length - keep.length };
}

// Layer 2 (runtimes): language runtimes declared by Dockerfile FROM lines.
// Official images pin their runtime in an env var (PHP_VERSION, NODE_VERSION, ...). Floating tags like php:8.3
// are resolved to that exact version with `skopeo inspect`, which reads registry metadata only: nothing is
// pulled or run. Components carry a CPE so Dependency-Track's NVD matcher can see them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { manifestsIn } from "../inspect";
import type { Bom } from "./deps";

export type FromLine = { image: string; line: number };

// FROM lines that name an external image: ARG defaults substituted, build stages and scratch skipped.
export function parseDockerfile(text: string): FromLine[] {
  const args = new Map<string, string>();
  const stages = new Set<string>();
  const out: FromLine[] = [];
  const lines = text.replace(/\\\r?\n/g, " ").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const l = raw.trim();
    const arg = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)=("?)([^"\s]+)\2/i.exec(l);
    if (arg) args.set(arg[1]!, arg[3]!);
    const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(l);
    if (!from) return;
    const image = from[1]!.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}?/g, (_, n, d) => args.get(n) ?? d ?? "$UNSET");
    if (from[2]) stages.add(from[2].toLowerCase());
    if (image === "scratch" || stages.has(image.toLowerCase()) || image.includes("$")) return;
    out.push({ image, line: i + 1 });
  });
  return out;
}

// Runtime env var in official images → product name, CPE vendor:product.
const RUNTIMES: Record<string, { name: string; cpe: string }> = {
  PHP_VERSION: { name: "php", cpe: "php:php" },
  NODE_VERSION: { name: "node", cpe: "nodejs:node.js" },
  PYTHON_VERSION: { name: "python", cpe: "python:python" },
  GOLANG_VERSION: { name: "go", cpe: "golang:go" },
  RUBY_VERSION: { name: "ruby", cpe: "ruby-lang:ruby" },
  JAVA_VERSION: { name: "openjdk", cpe: "oracle:openjdk" },
};

type Component = {
  "bom-ref": string; type: string; name: string; version: string; purl: string; cpe?: string;
  properties: { name: string; value: string }[];
};

export function runtimeComponents(env: string[], image: string, source: string): Component[] {
  const out: Component[] = [];
  for (const kv of env) {
    const eq = kv.indexOf("=");
    const rt = RUNTIMES[kv.slice(0, eq)];
    if (!rt) continue;
    // Temurin's JAVA_VERSION looks like jdk-21.0.4+7; keep the numeric part.
    const version = kv.slice(eq + 1).replace(/^jdk-?/, "").replace(/\+.*/, "");
    if (!/^\d+(\.\d+)*/.test(version)) continue;
    out.push({
      "bom-ref": `sbomer-runtime:${source}:${rt.name}`,
      type: "framework",
      name: rt.name,
      version,
      purl: `pkg:generic/${rt.name}@${version}`,
      cpe: `cpe:2.3:a:${rt.cpe}:${version}:*:*:*:*:*:*:*`,
      properties: [
        { name: "sbomer:resolution", value: "image-env" },
        { name: "sbomer:source", value: source },
        { name: "sbomer:image", value: image },
      ],
    });
  }
  return out;
}

export type Inspector = (image: string) => Promise<string[] | undefined>;

// Registry metadata for linux/amd64. Returns undefined when the image can't be inspected (private, gone, offline).
export const skopeoEnv: Inspector = async (image) => {
  const ref = image.includes("/") || image.includes(".") ? image : `docker.io/library/${image}`;
  const p = Bun.spawn(
    ["skopeo", "inspect", "--override-os", "linux", "--override-arch", "amd64", "--format", "{{json .Env}}", `docker://${ref}`],
    { stdout: "pipe", stderr: "ignore" },
  );
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  return code === 0 ? (JSON.parse(out) as string[] | null) ?? [] : undefined;
};

export async function scanRuntimes(dir: string, inspect: Inspector = skopeoEnv): Promise<{ components: Component[]; unresolved: string[] }> {
  const files = manifestsIn(dir).get("docker (stage 2)") ?? [];
  const cache = new Map<string, string[] | undefined>();
  const components: Component[] = [];
  const unresolved: string[] = [];
  for (const f of files) {
    for (const { image, line } of parseDockerfile(readFileSync(join(dir, f), "utf8"))) {
      if (!cache.has(image)) cache.set(image, await inspect(image));
      const env = cache.get(image);
      if (!env) {
        unresolved.push(`${f}:${line} ${image}`);
        continue;
      }
      components.push(...runtimeComponents(env, image, `${f}:${line}`));
    }
  }
  return { components, unresolved };
}

export function addRuntimes(bom: Bom, extra: Component[]): Bom {
  return { ...bom, components: [...(bom.components ?? []), ...extra] };
}

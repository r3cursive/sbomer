// Pinned scanner binaries live in ./bin. Every download is checked against tools.lock.json before it is unpacked.
import { mkdir, rm, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(import.meta.dir, "..");
export const BIN = join(ROOT, "bin");

type ToolLock = { version: string; url: string; sha256: Record<string, string> };

function platform(): string {
  const os = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "amd64";
  return `${os}_${arch}`;
}

export function toolPath(name: string): string {
  return join(BIN, name);
}

export async function installTool(name: string): Promise<string> {
  const locks: Record<string, ToolLock> = await Bun.file(join(ROOT, "tools.lock.json")).json();
  const lock = locks[name];
  if (!lock) throw new Error(`no lock entry for ${name}`);
  const plat = platform();
  const want = lock.sha256[plat];
  if (!want) throw new Error(`no pinned sha256 for ${name} on ${plat}`);

  const dest = toolPath(name);
  if (existsSync(dest) && (await versionOf(dest)) === lock.version) return dest;

  const [os, arch] = plat.split("_") as [string, string];
  const url = lock.url.replaceAll("{version}", lock.version).replaceAll("{os}", os).replaceAll("{arch}", arch);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const got = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  if (got !== want) throw new Error(`sha256 mismatch for ${name}: want ${want}, got ${got}`);

  const tmp = join(tmpdir(), `sbomer-${name}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const tgz = join(tmp, "a.tar.gz");
    await Bun.write(tgz, bytes);
    await run(["tar", "-xzf", tgz, "-C", tmp, name]);
    await mkdir(BIN, { recursive: true });
    await Bun.write(dest, Bun.file(join(tmp, name)));
    await chmod(dest, 0o755);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return dest;
}

async function versionOf(bin: string): Promise<string | undefined> {
  const p = Bun.spawnSync([bin, "version"], { stdout: "pipe", stderr: "ignore" });
  return /Version:\s+(\S+)/.exec(p.stdout.toString())?.[1];
}

export async function run(cmd: string[], opts: { cwd?: string } = {}): Promise<string> {
  const p = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new Error(`${cmd.join(" ")} exited ${code}: ${err.trim()}`);
  return out;
}

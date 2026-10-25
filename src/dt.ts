// Dependency-Track 5 API client. Credentials live in the repo's gitignored .env, which Bun loads automatically.
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { config, ROOT } from "./config";
import type { Bom } from "./layers/deps";

const ENV_FILE = join(ROOT, ".env");
const BASE = process.env.DT_URL ?? `http://127.0.0.1:${config().stack.api_port}`;

// The Automation team is created by DT on first boot. These are the permissions sbomer needs on top of its defaults.
const AUTOMATION_PERMISSIONS = [
  "BOM_UPLOAD", "PROJECT_CREATION_UPLOAD", "VIEW_PORTFOLIO", "VIEW_VULNERABILITY", "VULNERABILITY_ANALYSIS",
];

async function call<T>(path: string, init: RequestInit & { token?: string; apiKey?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.apiKey) headers.set("X-Api-Key", init.apiKey);
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  // DT answers 304 to a config PUT that changes nothing.
  if (!res.ok && res.status !== 304) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  return (text && res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text) as T;
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  };
}

async function adminToken(password: string): Promise<string> {
  return call<string>("/v1/user/login", form({ username: "admin", password }));
}

// Applies sources.osv from sbomer.yaml and kicks off a mirror run. Safe to repeat.
export async function enableSources(token: string): Promise<void> {
  const want = config().sources.osv;
  const osv = "/v2/extension-points/vuln-data-source/extensions/osv/config";
  const { config: current } = await call<{ config: Record<string, unknown> }>(osv, { token });
  await call(osv, {
    method: "PUT",
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: { ...current, enabled: want.enabled, aliasSyncEnabled: true, ecosystems: want.ecosystems } }),
  });
  if (!want.enabled) return;
  await call("/v2/vuln-data-sources/osv/mirror-runs", { method: "POST", token }).catch((e) => {
    // A run already in progress is fine.
    if (!String(e).includes("HTTP 409")) throw e;
  });
}

type Team = { uuid: string; name: string; permissions: { name: string }[] };

async function automationTeam(token: string): Promise<Team> {
  const teams = await call<Team[]>("/v1/team", { token });
  const automation = teams.find((t) => t.name === "Automation");
  if (!automation) throw new Error("Automation team not found");
  return automation;
}

// Grants whatever AUTOMATION_PERMISSIONS lists that the team lacks, so new permissions reach existing installs.
async function syncPermissions(token: string, team: Team): Promise<void> {
  const have = new Set(team.permissions.map((p) => p.name));
  for (const perm of AUTOMATION_PERMISSIONS.filter((p) => !have.has(p))) {
    await call(`/v1/permission/${perm}/team/${team.uuid}`, { method: "POST", token });
  }
}

// First run rotates the default admin password and mints an Automation team API key, both into .env.
// Every run re-syncs permissions and sources.
export async function bootstrap(): Promise<void> {
  if (process.env.DT_API_KEY) {
    const token = await adminToken(process.env.DT_ADMIN_PASSWORD ?? "");
    await syncPermissions(token, await automationTeam(token));
    await enableSources(token);
    return;
  }
  const password = crypto.randomUUID() + crypto.randomUUID();
  try {
    await adminToken("admin");
  } catch (e) {
    if (!String(e).includes("FORCE_PASSWORD_CHANGE")) throw e;
    await call("/v1/user/forceChangePassword", form({
      username: "admin", password: "admin", newPassword: password, confirmPassword: password,
    }));
  }
  const token = await adminToken(password);
  const team = await automationTeam(token);
  await syncPermissions(token, team);
  const key = await call<{ key: string }>(`/v1/team/${team.uuid}/key`, { method: "PUT", token });

  const env = `DT_URL=${BASE}\nDT_ADMIN_PASSWORD=${password}\nDT_API_KEY=${key.key}\n`;
  await Bun.write(ENV_FILE, env);
  await chmod(ENV_FILE, 0o600);
  process.env.DT_API_KEY = key.key;
  await enableSources(token);
}

function apiKey(): string {
  const key = process.env.DT_API_KEY;
  if (!key) throw new Error("DT_API_KEY missing; run `sbomer setup` first");
  return key;
}

export async function uploadBom(project: string, version: string, bom: Bom): Promise<string> {
  const res = await call<{ token: string }>("/v1/bom", {
    method: "PUT",
    apiKey: apiKey(),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectName: project,
      projectVersion: version,
      autoCreate: true,
      isLatest: true,
      bom: Buffer.from(JSON.stringify(bom)).toString("base64"),
    }),
  });
  return res.token;
}

export async function waitForBom(token: string, seconds = config().scan.bom_wait_seconds): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    const { processing } = await call<{ processing: boolean }>(`/v1/bom/token/${token}`, { apiKey: apiKey() });
    if (!processing) return;
    await Bun.sleep(1000);
  }
  throw new Error(`BOM ${token} still processing after ${seconds}s`);
}

export type Project = { uuid: string; name: string; version: string };

export async function lookupProject(name: string, version: string): Promise<Project> {
  const q = new URLSearchParams({ name, version });
  return call<Project>(`/v1/project/lookup?${q}`, { apiKey: apiKey() });
}

export type Finding = {
  component: { name: string; version?: string; purl?: string; group?: string };
  vulnerability: { vulnId: string; source: string; severity: string };
};

export async function findings(projectUuid: string): Promise<Finding[]> {
  return call<Finding[]>(`/v1/finding/project/${projectUuid}?suppressed=false`, { apiKey: apiKey() });
}

export async function componentCount(projectUuid: string): Promise<number> {
  const res = await fetch(`${BASE}/api/v1/component/project/${projectUuid}?pageSize=1`, {
    headers: { "X-Api-Key": apiKey() },
  });
  if (!res.ok) throw new Error(`component count: HTTP ${res.status}`);
  return Number(res.headers.get("X-Total-Count") ?? 0);
}

export async function analyze(projectUuid: string): Promise<void> {
  await call(`/v1/finding/project/${projectUuid}/analyze`, { method: "POST", apiKey: apiKey() }).catch((e) => {
    // 409 means an analysis is already running for this project, which is what we asked for.
    if (!String(e).includes("HTTP 409")) throw e;
  });
}

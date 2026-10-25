// Dependency-Track 5 on a podman network: postgres + apiserver + frontend, published on localhost only.
// No compose provider needed. Images are pinned by digest in sbomer.yaml.
import { config } from "./config";
import { run } from "./tools";

const { network: NET, api_port: API_PORT, ui_port: UI_PORT, images: IMAGES } = config().stack;

// Postgres publishes no port, so the fixed local password is only reachable on the private network.
const DB = { name: "dtrack", user: "dtrack", password: "dtrack" };

const CONTAINERS: [string, string[]][] = [
  [`${NET}-postgres`, [
    "-e", `POSTGRES_DB=${DB.name}`, "-e", `POSTGRES_USER=${DB.user}`, "-e", `POSTGRES_PASSWORD=${DB.password}`,
    "-v", `${NET}-pg:/var/lib/postgresql`, IMAGES.postgres,
  ]],
  [`${NET}-apiserver`, [
    "-p", `127.0.0.1:${API_PORT}:8080`,
    "-e", `DT_DATASOURCE_URL=jdbc:postgresql://${NET}-postgres:5432/${DB.name}`,
    "-e", `DT_DATASOURCE_USERNAME=${DB.user}`, "-e", `DT_DATASOURCE_PASSWORD=${DB.password}`,
    "-e", "DT_TELEMETRY_SUBMISSION_DEFAULT_ENABLED=false",
    "-v", `${NET}-data:/data`, IMAGES.apiserver,
  ]],
  [`${NET}-frontend`, [
    "-p", `127.0.0.1:${UI_PORT}:8080`, "-e", `API_BASE_URL=http://localhost:${API_PORT}`, IMAGES.frontend,
  ]],
];

function exists(kind: "network" | "container", name: string): boolean {
  return Bun.spawnSync(["podman", kind, "exists", name]).exitCode === 0;
}

export async function up(): Promise<void> {
  if (!exists("network", NET)) await run(["podman", "network", "create", NET]);
  for (const [name, args] of CONTAINERS) {
    if (exists("container", name)) await run(["podman", "start", name]);
    else await run(["podman", "run", "-d", "--network", NET, "--name", name, "--restart", "unless-stopped", ...args]);
    if (name.endsWith("postgres")) await waitFor(() => pgReady(name), "postgres", 60);
  }
  await waitFor(apiReady, "Dependency-Track API", 180);
}

export async function down(): Promise<void> {
  for (const [name] of [...CONTAINERS].reverse()) if (exists("container", name)) await run(["podman", "stop", name]);
}

function pgReady(name: string): boolean {
  return Bun.spawnSync(["podman", "exec", name, "pg_isready", "-U", DB.user, "-d", DB.name]).exitCode === 0;
}

export async function waitFor(check: () => boolean | Promise<boolean>, what: string, seconds: number): Promise<void> {
  for (let i = 0; i < seconds; i++) {
    if (await check()) return;
    await Bun.sleep(1000);
  }
  throw new Error(`${what} not ready after ${seconds}s`);
}

export async function apiReady(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${config().stack.api_port}/api/version`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

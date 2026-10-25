# sbomer

Repo-first exposure finding. When an advisory drops, sbomer answers "which of our repos ship this, and where?" with a query, so nobody has to rescan everything by hand.

It started after the week of 2026-10-19, when PHP, Node.js (a Brotli RCE inside Node), Python Brotli, GitLab and eMudhra's CA certificates all landed at once.

## How it works

Each repo is scanned in three layers and stored as CycloneDX in [Dependency-Track](https://dependencytrack.org/):

1. **Dependencies** from lockfiles and manifests (syft).
2. **Declared runtimes** from Dockerfile `FROM`, `.nvmrc`, CI setup steps *(stage 2)*.
3. **Declared images and services** from compose files and Helm values *(stage 2)*.

Dependency-Track matches the components against NVD and OSV.

## Status

| Stage | What | State |
|---|---|---|
| 0 | Pinned tools, local Dependency-Track 5 | done |
| 1 | Dependency layer → Dependency-Track | done (canary e2e passes) |
| 2 | Runtime + service layers | next |
| 3 | `query` and `report` | |
| 4+ | Runtime internals, reachability, local-model triage, trust stores | planned |

## Use

Needs [Bun](https://bun.sh) and podman.

```sh
bun install
bun src/cli.ts setup          # fetch pinned syft, start Dependency-Track, create .env with an API key
bun src/cli.ts scan --all     # scan every target in targets.yaml
bun src/cli.ts scan fixtures/canary
bun src/cli.ts scan owner/repo[@ref] # ad hoc
bun src/cli.ts inspect <target>  # manifests in the repo vs ecosystems in the BOM
bun src/cli.ts pick [language]   # random public repo for the improvement loop
bun run test:e2e              # known-answer checks against the canary fixture
bun src/cli.ts down
```

UI: http://127.0.0.1:8080. API: http://127.0.0.1:8081. Both are bound to localhost.

`setup` rotates Dependency-Track's default admin password and writes it, with the API key, to a gitignored `.env` (mode 600).

## Test matrix

`targets.yaml` lists public repos picked for their different shapes: Go single module (Twitch), pnpm monorepo (Palantir Blueprint), Gradle with `versions.lock` (Palantir Conjure), Go multi-module with compose files (Datadog Agent), a polyglot monorepo (AWS CDK), and Python/npm services with Dockerfiles (Duolingo). `fixtures/canary` holds deliberately old versions with known answers.

## Improving in public

Each loop iteration scans a random public repo, fixes the biggest gap it finds, and writes a blameless postmortem. See [docs/POSTMORTEMS.md](docs/POSTMORTEMS.md), [docs/LESSONS.md](docs/LESSONS.md) and [docs/postmortems/](docs/postmortems/).

## Supply chain

Scanner binaries are downloaded into `./bin` and checked against the sha256 values in `tools.lock.json`. Container images are pinned by digest in `src/stack.ts`.

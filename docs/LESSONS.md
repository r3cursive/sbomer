# Lessons

Read this before every loop iteration. Each line is a single imperative lesson with its source postmortem. Merge duplicates, and delete lessons once a test enforces them.

## Stage 0 (bootstrap)

- **L1** Treat HTTP 304 from a Dependency-Track config PUT as success: it means nothing changed. *(stage 0)*
- **L2** Check a vendor's current major version before writing the integration: Dependency-Track 5 moved vuln sources to `/api/v2/extension-points` and dropped the v4 config properties. *(stage 0)*
- **L3** Expect containers in one podman pod to share ports: DT's apiserver and frontend both listen on 8080, so they need a network rather than a pod. *(stage 0)*
- **L4** Expect vuln data sources to ship disabled: DT 5 enables only NVD, so OSV has to be turned on in `sbomer.yaml`. *(stage 0)*
- **L5** Look up the permission behind each DT endpoint before calling it with the API key. `analyze` needs VULNERABILITY_ANALYSIS, and permissions are synced on every `setup` so new ones reach existing installs. *(stage 1)*
- **L6** When a safety scanner hits its own test fixtures, assemble them at runtime instead of weakening the pattern. *(stage 0)*

## Loop

- **L7** Count coverage against real dependencies. A build tool in the BOM (the Gradle wrapper) does not prove the build resolved. *(001)*
- **L8** Filter BOMs before upload. Components DT can't match inflate counts and hide gaps. *(001)*
- **L9** Scope every tool that walks the tree (tsc, linters, tests) away from `work/`, which holds untrusted clones. *(001)*

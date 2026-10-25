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
- **L10** Treat "the scanner found nothing" as a finding about the scanner until a manifest proves otherwise. *(002)*
- **L11** Never accept a guessed version. Resolve it for real or leave it out: a wrong version is worse than a missing one. *(002)*
- **L12** Label every component sbomer infers with how it was obtained (`sbomer:resolution`), so locked and resolved results stay distinguishable. *(002)*
- **L13** Ask where a component came from before counting it. Its path is the cheapest signal of whether it's real or a fixture. *(003)*
- **L14** Check that a tool applied a filter by counting what's left. syft silently ignored excludes without a leading `./`. *(003)*
- **L15** Check a repo's age and lifetime star rate before trusting its star count. *(004)*
- **L16** Know each scanner's default scope. syft's npm default leaves out dev dependencies, and dev and CI installs are an attack path. *(004)*
- **L17** Close an open assumption with one API call as soon as it blocks a design choice. DT does keep `sbomer:*` properties. *(004)*
- **L18** Derive coverage expectations from the repo's language and build files, not just its package manifests. What the manifests leave out is the gap. *(005)*
- **L19** Resolve floating image tags from the image's own env (`skopeo inspect`). It's exact, and nothing gets pulled or run. *(005)*
- **L20** Expect NVD entries that match every version. Rank them, don't trust them. *(005)*
- **L21** Treat 409 from DT's analyze endpoint as "already running", and make e2e suites set up their own state (scan at the current commit) instead of relying on the last manual run. *(005)*

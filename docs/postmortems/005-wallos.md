# 005: ellite/Wallos (PHP, self-hosted app, Dockerfile, vendored libs, no Composer)

- **Date:** 2026-10-25
- **Target:** ellite/Wallos@d799b8f
- **Lessons applied:** L10 (zero PHP components in a PHP app treated as a scanner gap), L11 (resolved `php:8.3` to its exact version and didn't guess), L12 (`sbomer:resolution=image-env`), L15 (pick passed the new age and star-rate filter)

## Summary

Wallos is a PHP app that ships as a `php:8.3-fpm-alpine` image, with no Composer manifest and its libraries copied into `libs/`. sbomer saw only GitHub Actions, and `inspect` passed it because it only checks ecosystems that have manifests. sbomer now reads Dockerfile `FROM` lines and resolves each official runtime image to its exact version from the image's own env. The canary's `php:8.1.0` now flags **CVE-2026-109618 and CVE-2026-109619**, the two critical PHP RCEs from 2026-10-21 that started this project.

## Expected vs actual (AAR)

| | Expected | Actual |
|---|---|---|
| Ecosystems | composer, plus the PHP runtime (invisible until stage 2) | github-actions only. No Composer manifest at all |
| Components | a few Composer packages | 10 actions; PHP runtime and `libs/` invisible |
| `inspect` | flags missing PHP coverage | passed: no manifest, so no row and no flag |
| After the fix | PHP runtime visible with an exact version | `php@8.3.36` (Wallos); `php@8.1.0` with 46 NVD findings (canary) |

## Timeline

| Step | What happened | Evidence |
|---|---|---|
| 1 | `pick` chose ellite/Wallos (PHP), passing the 004 filters | `pick` output |
| 2 | scan: 10 components, all GitHub Actions | `scan` output |
| 3 | `Dockerfile:2 FROM php:8.3-fpm-alpine`; `libs/` holds PHPMailer, OTPHP, Parsedown, Psr | rg, ls |
| 4 | `skopeo inspect` gives `PHP_VERSION=8.3.36` without pulling | skopeo output |
| 5 | added the runtime layer: parse FROM, resolve via image env, emit a component with a CPE | `src/layers/runtimes.ts` |
| 6 | unit test caught an unset `${BASE}` becoming an empty image name; fixed | `test/unit/runtimes.test.ts` |
| 7 | canary `FROM php:8.1.0-cli`: 46 findings, including CVE-2026-109618/109619 (critical, published 2026-10-21) | DT findings + NVD record |
| 8 | Wallos `php@8.3.36`: one finding, CVE-2007-3205, an all-versions NVD entry | DT vuln record |

## Root cause

The only source of components was package manifests. A runtime declared in a Dockerfile, and code vendored as plain files, never became components. `inspect` derived its expectations from those same manifests, so it couldn't notice what they don't describe.

## Contributing factors

- Floating tags (`php:8.3`) don't carry an exact version. Without a resolver, the only options were to guess (ruled out by L11) or skip.
- Self-hosted PHP apps often ship without Composer and copy libraries in.
- The canary didn't declare a runtime until this iteration.

## What went well

- Official images record the runtime version in env, so resolution is exact and needs no pull or run.
- The CPE on each runtime component let DT's existing NVD matcher work unchanged.
- The canary now covers the PHP issue end to end: Dockerfile → exact version → DT → the Oct 21 CVEs.

## Action items

| # | Action | Status | Proof |
|---|---|---|---|
| 1 | Resolve runtimes from Dockerfile FROM via image env (php, node, python, go, ruby, openjdk) | done | `test/unit/runtimes.test.ts`, Wallos `php@8.3.36` |
| 2 | Report images that can't be inspected instead of dropping them | done | `runtime unresolved` lines, unit test |
| 3 | Add the PHP runtime to the canary, with an e2e assertion for CVE-2026-109618/109619 | done | `test/e2e/canary.test.ts` |
| 3a | Make e2e scan the canary at the current commit, and accept 409 from `analyze` | done | both failed on the first run after commit `2f82b0c` |
| 4 | Make `inspect` flag a language repo whose own language has no components (Wallos: PHP app, 0 PHP) | open | |
| 5 | Catalog vendored libraries (`libs/`, `vendor/` without a lockfile) | open | needs a file-signature approach |
| 6 | Suppress or downrank all-versions NVD entries like CVE-2007-3205 on modern runtimes | open | stage 3 report |
| 7 | `.nvmrc`, `.python-version`, CI `setup-*` and compose service images (rest of stage 2) | open | |

## Lessons

- Run the e2e suite before pushing. This iteration pushed `2f82b0c` before seeing two e2e failures (a stale canary version and an unhandled 409). Both are fixed in the follow-up commits.
- Derive coverage expectations from the repo's language and build files, not just its package manifests. What the manifests leave out is the gap.
- Resolve floating image tags from the image's own metadata. It's exact, and nothing gets pulled or run.
- Expect NVD entries that match every version. Rank them, don't trust them.

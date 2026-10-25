# 002: 3b1b/manim (Python, unlocked requirements + setup.cfg)

- **Date:** 2026-10-25
- **Target:** 3b1b/manim@fafa083
- **Lessons applied:** L7 (counted real PyPI components, not BOM size), L8 (resolved components flow through `normalize`), L9 (moved the shell back out of the clone before running tools)

## Summary

manim declares about 30 runtime dependencies and 4 docs dependencies, none pinned to an exact version, and has no lockfile. syft produced zero PyPI components, so DT saw only 5 GitHub Actions. sbomer now resolves unlocked requirements files the way a fresh install would today. That gives 91 PyPI components and 2 real findings (diskcache 5.6.3).

## Expected vs actual (AAR)

| | Expected | Actual |
|---|---|---|
| Ecosystems | pypi | github-actions only |
| Components | 20–30 direct deps, some without versions | 0 PyPI (syft skips unpinned lines entirely) |
| Findings | unknown | 0 before, 2 after (diskcache GHSA-w8v5-vhqr-4h9v, PYSEC-2026-2447) |

## Timeline

| Step | What happened | Evidence |
|---|---|---|
| 1 | `pick` chose 3b1b/manim (Python) | `pick` output |
| 2 | scan: 5 DT components, all GitHub Actions | `scan` output |
| 3 | `inspect` flagged pypi: 4 manifests, 0 components | exit 3 (the stage 1 rule from 001 caught it) |
| 4 | the manifests are bare names and `>=` ranges, with no `==` pins | requirements.txt, setup.cfg |
| 5 | syft config: `guess-unpinned-requirements` would invent the lowest version a range allows | `syft config` |
| 6 | added `resolve_unlocked_python`: `uv pip compile --no-build --universal` per unlocked file | rescan: 91 PyPI |
| 7 | DT matched diskcache 5.6.3 (2 advisories) | DT findings API |

## Root cause

syft catalogs Python requirements only when they pin an exact version. An unlocked project therefore produces an empty dependency layer, and nothing downstream learned that the layer was empty. `inspect` caught it only because 001 had sharpened the coverage rule.

## Contributing factors

- syft's one alternative (`guess-unpinned-requirements`) picks the lowest version a range allows, which may never have been published. That's precise-looking and wrong.
- Libraries (as opposed to applications) don't ship lockfiles by convention, so this shape is common.
- Our canary only had pinned requirements, so stage 1 never exercised this path.

## What went well

- 001's `inspect` change paid off right away: the gap was flagged on the first scan.
- `--no-build` keeps resolution to metadata. No code from the target or its dependencies runs.
- The resolved components carry `sbomer:resolution=resolved` and `sbomer:source`, so a lockfile result and a "what you'd install today" result stay distinguishable.

## Action items

| # | Action | Status | Proof |
|---|---|---|---|
| 1 | Resolve unlocked requirements files when the repo has no Python lockfile | done | `test/unit/resolve.test.ts`, manim 0 → 91 |
| 2 | Make it switchable in config | done | `scan.resolve_unlocked_python` in `sbomer.yaml` |
| 3 | Resolve `pyproject.toml` / `setup.cfg`-only projects (no requirements file) | open | needs static-metadata handling; `--no-build` refuses dynamic metadata |
| 4 | Add an unlocked-requirements case to the canary | open | |
| 5 | Show the resolution kind in reports (stage 3) | open | |

## Lessons

- Treat "the scanner found nothing" as a finding about the scanner until a manifest proves otherwise.
- When a tool offers to guess a version, resolve it for real or leave it out. A wrong version is worse than a missing one.
- Label every component sbomer infers with how it was obtained (locked, resolved, declared).

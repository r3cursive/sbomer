# 003: aquasecurity/trivy (Go, scanner repo full of test fixtures)

- **Date:** 2026-10-25
- **Target:** aquasecurity/trivy@3a0164d
- **Lessons applied:** L7 (counted real dependencies: located every component by path before trusting the totals), L8 (filtered before upload), L10 (assumed the scanner output was wrong until the paths proved otherwise)

## Summary

trivy tests itself on deliberately vulnerable lockfiles for every ecosystem it supports. sbomer read them as trivy's own dependencies: 56% of components came from `testdata/`, and DT reported 17 criticals. Excluding fixture directories (configurable in `sbomer.yaml`) brought this down to the 475 Go modules and the docs build's Python pins: 71 findings, 2 critical, all real.

## Expected vs actual (AAR)

| | Expected | Actual |
|---|---|---|
| Ecosystems | golang, plus fixture noise | 14 purl types, including conan, hex, pub and cocoapods (all fixtures) |
| Components | ~300+ Go modules | 1,047 before (707 of 1,271 raw from fixtures), 538 after |
| Findings | dominated by fixtures | 100 before (17 critical), 71 after (2 critical) |

## Timeline

| Step | What happened | Evidence |
|---|---|---|
| 1 | `pick` chose aquasecurity/trivy (Go) | `pick` output |
| 2 | scan: 1,047 components across 14 ecosystems | `scan` output |
| 3 | `inspect` reported every ecosystem ok, which is technically true and useless | `inspect` output |
| 4 | split components by `syft:location` path: 707 under `testdata`/`fixtures` | jq over the BOM |
| 5 | DT: 100 findings, 17 critical | findings API |
| 6 | added `scan.exclude` globs, applied to syft, `inspect` and the resolver | rescan: 538 components, 0 under testdata |
| 7 | DT: 71 findings, 2 critical; remaining PyPI is `docs/build/requirements.txt` | findings API |

## Root cause

sbomer treated every manifest in the tree as a production dependency. Nothing told it which directories hold test fixtures, so a scanner's test corpus showed up as the scanner's own attack surface.

## Contributing factors

- `inspect` checks whether each ecosystem has components. It doesn't ask where they came from, so a flood of fixtures looked like great coverage.
- syft's `--exclude` matches paths relative to the scan root, and a pattern only matches with a leading `./`. A bare `**/testdata/**` is silently ignored.
- Security tooling and parser repos are the worst case, and we're likely to scan many of them.

## What went well

- The path properties syft emits made the split exact. No guessing was needed.
- The excludes live in config, not code, so a repo where `testdata` matters can override them in `sbomer.local.yaml`.
- The remaining findings are worth acting on: the docs build pins urllib3 2.2.3 and requests 2.32.3.

## Action items

| # | Action | Status | Proof |
|---|---|---|---|
| 1 | Exclude fixture directories from syft, `inspect` and the resolver | done | `scan.exclude`, `test/unit/inspect.test.ts` |
| 2 | Translate globs to syft's `./`-relative form | done | `src/layers/deps.ts`; trivy rescan shows 0 testdata components |
| 3 | Tag docs- and CI-only manifests (`docs/`, `.github/`) as non-runtime, so they rank below production deps | open | stage 3 report |
| 4 | Add a per-path breakdown to `inspect`, so a fixture flood is visible without jq | open | |

## Lessons

- Ask where a component came from before counting it. The path is the cheapest signal of whether it's real.
- Check that a tool applied a filter by counting what's left. Syntax it doesn't understand often fails silently.

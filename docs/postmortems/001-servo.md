# 001: servo/servo (Rust, Cargo workspace + WPT Python + Android Gradle)

- **Date:** 2026-10-25
- **Target:** servo/servo@4b3bd9569
- **Lessons applied:** L2 (checked syft's current CycloneDX output shape before writing the filter), L5 (no new DT endpoints, so nothing to check)

## Summary

The Cargo and Python coverage was good. Two problems hid behind the counts. About 11% of the components DT received (186 of 1,629) could never match a vulnerability, and five Android Gradle builds came through as a single Gradle wrapper entry, which `inspect` scored as covered.

## Expected vs actual (AAR)

| | Expected | Actual |
|---|---|---|
| Ecosystems | cargo, pypi, maybe npm | cargo, pypi, npm, github-actions, maven (wrapper only) |
| Components | 500–800 crates | 1,147 crates, 305 PyPI, 208 actions, 265 with no purl |
| Gaps found by `inspect` | Python under WPT, if any | none reported (wrong) |

## Timeline

| Step | What happened | Evidence |
|---|---|---|
| 1 | `pick` chose servo/servo (Rust) | `pick` output |
| 2 | scan: 1,629 DT components in 47s | `scan` output |
| 3 | `inspect` said every ecosystem was ok | exit 0 |
| 4 | broke down the purl-less components: 114 `file`, 151 `./.github/actions/*` repeated once per workflow | jq over `work/boms` |
| 5 | Maven: 5 `build.gradle.kts`, the only component is `gradle-wrapper` | jq + fd |
| 6 | added `normalize`, sharpened `inspect`, rescan: 186 dropped, Gradle flagged | rescan output |
| 7 | `tsc` failed on a binary `.ts` in the WPT tree | typecheck output |

## Root cause

`inspect` treated "more than zero components" as coverage. A build tool entry (`gradle-wrapper`) satisfied that for Maven, even though no dependency had been resolved. Separately, the upload path sent syft's raw output to DT without filtering out entry kinds that can't be matched.

## Contributing factors

- syft has no way to resolve Gradle dependencies without a lockfile, and it reports the wrapper instead of saying nothing.
- syft emits a component for each workflow's use of a repo-local action, rather than one per action.
- `tsconfig.json` had no `include`, so `tsc` walked the cloned repos in `work/`.

## What went well

- Cargo and the 85 Python manifests in the WPT tree resolved without help.
- The canary pattern carried over: the new tests reuse servo's real component shapes.

## Action items

| # | Action | Status | Proof |
|---|---|---|---|
| 1 | Drop `file` components and repo-local actions before upload | done | `test/unit/bom.test.ts` |
| 2 | Don't count build tooling as coverage, and flag JVM builds with no lockfile | done | `test/unit/inspect.test.ts` |
| 3 | Scope `tsc` to `src`, `scripts` and `test` | done | `tsconfig.json`, typecheck passes |
| 4 | Resolve Gradle builds without a lockfile (run `gradle dependencies` in a container, or generate a lockfile) | open | needs a sandboxed build runner |
| 5 | Decide whether first-party workspace crates (79 purl-less) should go to DT | open | |

## Lessons

- Count coverage against real dependencies: build tooling in the BOM is not proof a build resolved.
- Filter BOMs before upload. Components that can't be matched inflate counts and hide gaps.
- Scope every tool that walks the tree (tsc, linters, tests) away from `work/`.

# 004: impress/impress.js (JavaScript, library with a dev-only lockfile)

- **Date:** 2026-10-25
- **Target:** impress/impress.js@b44b969 (second pick; see timeline)
- **Lessons applied:** L10 (one npm component from a 595-entry lockfile was treated as a scanner finding), L12 (dev components are labeled, not mixed in), L13 (checked the picked repo's history before cloning)

## Summary

The first pick was a month-old repo with 41k stars whose description promises free frontier models with no API key. That star rate doesn't happen naturally, so the loop skipped it and the picker now filters on age and star velocity. The second pick, impress.js, showed a real gap: syft drops npm dev dependencies by default, so a 595-entry lockfile became 1 component. Dev dependencies now go in, tagged `sbomer:scope=dev`, which Dependency-Track keeps.

## Expected vs actual (AAR)

| | Expected | Actual |
|---|---|---|
| Pick | an established JavaScript project | a repo created 2026-09-24 with 41,265 stars (about 1,300 a day) |
| Ecosystems | npm | npm |
| Components | most of the lockfile, mainly dev tooling | 1 before (594 of 595 entries are `dev: true`), 498 after |
| Findings | some, all in tooling | 0 before, 100 after (3 critical, 52 high), all dev-scoped |

## Timeline

| Step | What happened | Evidence |
|---|---|---|
| 1 | `pick` chose a repo whose metadata looked star-farmed | `gh api` created_at, stars |
| 2 | skipped without cloning, removed from `targets.yaml` | this postmortem |
| 3 | added `min_age_days` and `max_stars_per_day`, re-picked JavaScript | `test/unit/pick.test.ts` |
| 4 | impress.js scan: 1 npm component from `package-lock.json` | `scan` output |
| 5 | lockfile v2: 595 packages, 594 `dev: true`; syft's `include-dev-dependencies` is off by default | jq, `syft config` |
| 6 | turned dev dependencies on in config, tagged them from the lockfile | rescan: 498 npm, 497 tagged dev |
| 7 | DT: 100 findings; component properties keep `sbomer:scope` | DT component property API |

## Root cause

There were two separate system gaps. The picker trusted star count as a quality signal, and stars can be bought. The dependency layer inherited syft's runtime-only default for npm, which fits "what ships" but misses what runs on developer machines and CI, which is where install-script worms do their work.

## Contributing factors

- `gh search` sorts and filters on stars, and nothing in the loop looked at the repo's age.
- The 001 coverage rule passed impress.js: npm had more than 0 components. Coverage was measured per ecosystem, never as a share of the lockfile.
- Whether DT kept custom properties was still open from the plan, so tagging scope had seemed riskier than it turned out to be.

## What went well

- The skip happened before any clone. Even so, the loop never runs target code (L9, `--no-build`).
- Lockfile v2's `dev` flags made the scope tag exact. Nothing was inferred.
- This closed the plan's open question: DT stores `sbomer:*` properties as group `sbomer`, so stage 3 reports can split dev from runtime.

## Action items

| # | Action | Status | Proof |
|---|---|---|---|
| 1 | Filter picks by repo age and lifetime star rate | done | `test/unit/pick.test.ts`, `loop.min_age_days`, `loop.max_stars_per_day` |
| 2 | Include npm dev dependencies, tagged `sbomer:scope=dev` | done | `test/unit/scope.test.ts`, impress.js 1 → 498 |
| 3 | Measure coverage as a share of lockfile entries, not just "more than 0" per ecosystem | open | would have caught this without jq |
| 4 | Tag dev scope for yarn, pnpm and Python dev groups (uv, poetry) | open | |
| 5 | Record skipped picks in the loop log with the reason | open | |

## Lessons

- Check a repo's age and star rate before trusting its star count.
- Know your scanner's default scope. syft's npm default is runtime-only, and the attack path this week ran through installs.
- Close an open assumption with one API call as soon as it blocks a design choice.

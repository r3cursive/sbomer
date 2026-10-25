# Postmortem process

sbomer improves through a loop: pick a random public repo, scan it, find where sbomer was wrong, fix it, write it up. Every iteration leaves a postmortem, even when nothing broke.

The process combines three sources:

- **Blameless postmortems** from Google SRE. The system is the subject of the root cause, never a person or "the model". Action items have to be measurable, or the write-up is paperwork.
- **After Action Review** (US Army). Four questions: what was expected, what happened, why they differed, and what to keep or change. They're short enough for an agent to answer honestly every time.
- **Reflexion** (Shinn et al., 2023). An agent improves between attempts by writing a short verbal lesson and reading it before the next try. Here that memory is `LESSONS.md`.

A notes file nobody reads changes nothing, so the loop puts two gates on it:

1. **Read gate.** An iteration starts by reading `LESSONS.md`. Its plan has to say which lessons apply.
2. **Proof gate.** Every fixed gap lands with a regression test or a fixture. An action item without a test, commit or issue link stays `open`.

## Loop

1. Read `LESSONS.md`.
2. `bun src/cli.ts pick` chooses a random repo in a language that recent postmortems haven't covered.
3. Write down the **expectation** before scanning: which ecosystems and roughly how many components should show up.
4. Scan it, then compare what DT holds against the repo's own manifests.
5. Fix the biggest gap, or log it as an action item when it's too big for one iteration.
6. Write `docs/postmortems/NNN-<slug>.md` from `TEMPLATE.md`.
7. Fold new lessons into `LESSONS.md`. Merge duplicates, and keep it short.
8. `bun test test/unit`, `bun run typecheck` and `bun run test:e2e` must all pass. Then commit and push (L21).

## Public safety

This repo is public. Postmortems use repo-relative paths only. The `public-check` hook blocks home paths, private hostnames and IPs, personal emails and a local deny list from every commit and commit message.

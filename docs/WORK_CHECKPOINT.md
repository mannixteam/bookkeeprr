# Bookkeeprr Work Checkpoint

This file is the persistent handoff between ChatGPT Work/Codex sessions. It must reflect repository reality, not assumptions.

## BASE
`feature/french-comics-bnf`

## CHECKPOINT SYSTEM BRANCH
`chore/work-checkpoint-system`

## BASELINE VERIFIED COMMIT
`7ad1ca98b81a270582baa78ab25ef3fb2b072971`

Commit message: `feat: add BnF French comics search and cover support`

## CURRENT OBJECTIVE
Make French BD/comics/manga support reliable enough for a real test on the user's Debian Docker VM, without modifying the currently deployed version.

## REQUIRED PHASES
- [x] Initial BnF French comics search and cover support exists in baseline.
- [x] Normalize and validate BnF ISBN-10/ISBN-13/book EAN, and preserve the explicitly selected notice.
- [ ] Harden the remaining BnF metadata behavior (outside this session).
- [ ] Add reliable complementary metadata for recent French editions absent from BnF.
- [ ] Harden series / volume / edition grouping.
- [ ] Harden edition deduplication.
- [ ] Implement multi-source French cover selection with real image validation.
- [ ] Expand French BD/comics/manga automated tests and CI coverage.
- [ ] Run full integration/regression pass and prepare a release candidate for real VM testing.

## STATUS
Completed the ISBN/EAN and selected-edition NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `82d6c7449b71d34d63e1cf73d2adb9c25d3b9ea3`.
Session date: 2026-09-25 (Europe/Paris).

### DONE in this session
- Validate ISBN-10 and ISBN-13 check digits; normalize lowercase X and separators.
- Convert ISBN-10 to the equivalent 978 EAN. Reject invalid and non-book identifiers.
- Extract separate identifiers from catalog prose without concatenating adjacent numbers.
- Keep ISBN and EAN tied to the same first valid edition, including when the notice lists multiple identifiers.
- Use the canonical EAN for the existing cover URL and ISBN search index.
- Reject a missing requested ARK instead of returning an unrelated notice.
- Preserve the selected notice and its ISBN/EAN when numbered or named albums have newer reissues.
- Reuse the already implemented identifier helper from `be4665fe7eeb54da8aed665452e98b6db4ae9faf`; only the identifier helper was imported from that branch.

### Exact verification
Command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf/identifiers.test.ts tests/server/french-comics-bnf.test.ts
```
Before fixes: **11 failed, 6 passed (17 total)**. After fixes: **17 passed, 0 failed**, two files.
The 15 focused cases below are now passing; `FAILED BEFORE` marks the 11 reproduced failures:
1. normalizes a hyphenated ISBN-13 in catalog prose
2. converts ISBN-10 to its equivalent edition EAN and cover key — FAILED BEFORE
3. normalizes a lowercase ISBN-10 check digit X — FAILED BEFORE
4. rejects an invalid or non-book identifier: 9782723488524 — FAILED BEFORE
5. rejects an invalid or non-book identifier: 0306406153 — FAILED BEFORE
6. rejects an invalid or non-book identifier: 4006381333931
7. rejects an invalid or non-book identifier: 97827234885250
8. rejects an invalid or non-book identifier: 978X723488525
9. skips a corrupt identifier before a valid one — FAILED BEFORE
10. keeps ISBN and EAN on the same edition when the notice lists different editions — FAILED BEFORE
11. does not concatenate adjacent identifiers — FAILED BEFORE
12. uses the ISBN index for a normalized ISBN lookup — FAILED BEFORE
13. never hydrates a different ARK when the requested notice is absent — FAILED BEFORE
14. preserves the explicitly selected edition among reissues: Sacrifice. Tome 1 — FAILED BEFORE
15. preserves the explicitly selected edition among reissues: Sacrifice — FAILED BEFORE

The two pre-existing tests also pass:
- parses French Tome notation as a volume
- matches verbose French publisher release names for BnF-backed comics

`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Tests use mocked SRU responses and existing local dependencies (Node 24.19.0, pnpm 9.15.0).
No full regression suite, CI validation, Docker build, live-provider validation, or VM deployment was performed for this checkpoint.

### Remaining limits observed in the scoped audit
- Series search still chooses one record per ordinal/title; this is not complete multi-edition deduplication.
- Unnumbered albums are still assigned invented sequential numbers in `chooseRecords`.
- General grouping, provider supplementation, and image-response validation remain unchecked phases above.

## DO NOT REDO
- Do not recreate the initial BnF integration from scratch.
- Do not re-audit or reimplement the completed ISBN/check-digit/EAN extraction and selected-ARK fixes above without a new failing case.
- Do not import unrelated release-branch changes or repeat the full repository audit.
- Do not alter the user's deployed production instance.
- Do not perform broad repository re-analysis when the next action can be answered from the files/tests directly relevant to it.
- Do not repeat a completed investigation unless a new failing test or code change invalidates it.

## SESSION DISCIPLINE
Each session should solve one bounded problem, run relevant tests, commit a verified checkpoint, update this file, set one next action, and stop. Prefer targeted file/code searches over rereading the whole repository.

## NEXT ACTION
Fix invented numbering of unnumbered BnF albums: add focused tests for `chooseRecords` through the BnF public API, preserve a null ordinal when no explicit volume number is provided, and update only directly affected consumers/types so unnumbered albums cannot create numbered library volumes. Run the relevant tests, commit, update this checkpoint with one next action, and stop.

## RELEASE GATE
Do not provide production deployment steps until all required phases above are complete, relevant CI/tests pass, and the resulting branch is explicitly identified as a release candidate.

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
- [x] Preserve unknown BnF ordinals and prevent unnumbered albums from creating numbered library rows.
- [x] Require confirmed French language consistently in BnF search and direct-ARK hydration.
- [ ] Harden the remaining BnF metadata behavior (outside the completed sessions).
- [ ] Add reliable complementary metadata for recent French editions absent from BnF.
- [ ] Harden series / volume / edition grouping.
- [ ] Harden edition deduplication.
- [ ] Implement multi-source French cover selection with real image validation.
- [ ] Expand French BD/comics/manga automated tests and CI coverage.
- [ ] Run full integration/regression pass and prepare a release candidate for real VM testing.

## STATUS
Completed the French-language eligibility NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `589dfb809eb44434f612af03850d29aabfc45487`.
Session date: 2026-09-25 (Europe/Paris).

### DONE: French-language eligibility
- Preserve all declared `dc.language` values instead of inspecting only the first.
- Apply one eligibility rule before series grouping/edition selection and before direct-ARK hydration.
- Reject an ineligible seed with `BnfError` status 422 before fetching related notices or modifying library metadata.
- Exclude foreign related volumes and foreign reissues from French series results.

### Language policy (intentional conservative behavior)
At least one nonempty language declaration is required, and every nonempty declaration must be recognized French.
Accepted values: `fr`, `fre`, `fra`, `français`/`francais`, `French`, and `fr-XX`/`fr_XX` with a two-letter region. Matching ignores case, surrounding whitespace and accents.
Repeated equivalent French declarations are accepted.
Missing/empty language, unsupported values (including `und` and `mul`), and French/foreign bilingual declarations are excluded from both search and hydration.
Do not infer French from title, ISBN prefix, publisher or BnF provenance. Unknown-language notices remain excluded until metadata supplies confirmation; this can omit genuine French books with incomplete notices.
This policy applies to the BnF integration, not other providers.

### Exact verification: French language
New tests before fixes: **20 failed, 8 passed (28 total)**, two files.
All 28 are now passing. Exact parameterized cases:
- `accepts confirmed French in search and direct hydration: %s`: `fr`, `fre`, `FRA`, ` français `, `French`, `fr-FR`, `fr_CA` (7 passed before/after).
- `rejects in search: %s` and `rejects direct hydration before fetching related notices: %s`: English, Portuguese, non-French label, missing, empty, undetermined, multiple unspecified, French then English, English then French (18 FAILED BEFORE).
- `filters foreign reissues before choosing an edition and excludes foreign related volumes` (FAILED BEFORE).
- `accepts repeated equivalent French declarations` (passed before/after).
- `does not modify the library when a BnF notice is not confirmed French` (FAILED BEFORE).

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **56 passed, 0 failed**, seven files (28 new tests plus the previous 28 regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Tests use mocked SRU responses; the library preservation test uses a temporary SQLite database and compares the complete series/volume records before and after rejection.
No full regression suite, CI validation, live-provider validation, Docker build or VM deployment was performed in this session.

## PREVIOUS SESSION: unnumbered albums
Completed the unnumbered-albums NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `6f2a27d19fcc053b7cce7ed9c3076489179f1e9a`.
Session date: 2026-09-25 (Europe/Paris).

### DONE: unnumbered albums
- `BnfComicVolume.number` is nullable; dates and result order never create an ordinal.
- Named albums remain in the catalog alongside numbered volumes.
- Descriptions cannot supply an ordinal mentioned for another album; explicit title/relation ordinals remain supported.
- `volumeCount` counts observed albums; it is not an inferred highest ordinal.
- Hydration skips unnumbered albums, creates only explicit numbered rows and is idempotent.
- Known library rows and totals are preserved; all-unnumbered results leave an unknown total null.
- No database schema change and no changes to the deployed VM.

### Exact verification: unnumbered albums
Before fixes, the two new files reproduced **7 failed, 1 passed (8 total)**.
New tests, all now passing (`FAILED BEFORE` identifies reproduced failures):
1. keeps named albums unnumbered regardless of dates or response order — FAILED BEFORE
2. retains unnumbered albums alongside explicit numbered volumes — FAILED BEFORE
3. does not take a volume number mentioned in a description — FAILED BEFORE
4. preserves explicit title and relation ordinals
5. keeps the selected unnumbered notice unnumbered during hydration — FAILED BEFORE
6. does not create numbered library volumes or totals from unnumbered albums — FAILED BEFORE
7. imports only explicit ordinals and remains idempotent for mixed results — FAILED BEFORE
8. preserves existing numbered volumes and known totals when only unnumbered albums return — FAILED BEFORE
The three integration failures initially hit SQLite's `NOT NULL` constraint for `volumes.number`.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf/numbering.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/server/integrations/bnf/identifiers.test.ts tests/server/french-comics-bnf.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **28 passed, 0 failed**, five files (8 new tests + 17 identifier/parser tests + 3 existing hydration tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Integration tests used temporary SQLite databases and mocked provider responses.
No full regression suite, CI validation, Docker build, live-provider validation or deployment was performed in this session.

## PREVIOUS SESSION: ISBN/EAN and selected edition
Completed the ISBN/EAN and selected-edition NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `82d6c7449b71d34d63e1cf73d2adb9c25d3b9ea3`.
Session date: 2026-09-25 (Europe/Paris).

### DONE: identifiers and selected edition
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
- Unnumbered albums now stay null and are not persisted as numbered library rows; this is intentional until reliable numbering is available.
- General grouping, provider supplementation, and image-response validation remain unchecked phases above.

## DO NOT REDO
- Do not recreate the initial BnF integration from scratch.
- Do not re-audit the verified French-language filtering or relax the documented missing-language policy without a new requirement or failing case.
- Do not reintroduce inferred ordinals or repeat the completed unnumbered-album investigation without a new failing case.
- Do not re-audit or reimplement the completed ISBN/check-digit/EAN extraction and selected-ARK fixes above without a new failing case.
- Do not import unrelated release-branch changes or repeat the full repository audit.
- Do not alter the user's deployed production instance.
- Do not perform broad repository re-analysis when the next action can be answered from the files/tests directly relevant to it.
- Do not repeat a completed investigation unless a new failing test or code change invalidates it.

## SESSION DISCIPLINE
Each session should solve one bounded problem, run relevant tests, commit a verified checkpoint, update this file, set one next action, and stop. Prefer targeted file/code searches over rereading the whole repository.

## NEXT ACTION
Implement bounded BnF SRU pagination so search can retrieve notices beyond the first page: add focused tests for multiple pages, repeated/non-advancing cursors, duplicate ARKs and a later-page failure; retain already verified results on a later-page failure, keep an explicit page/time bound, run relevant tests, commit, update this checkpoint with one next action, and stop.

## RELEASE GATE
Do not provide production deployment steps until all required phases above are complete, relevant CI/tests pass, and the resulting branch is explicitly identified as a release candidate.

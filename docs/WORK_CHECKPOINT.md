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
- [x] Bound BnF SRU pagination and preserve results on later-page failures.
- [x] Validate BnF SRU XML/envelopes and response-level diagnostics before accepting a page.
- [ ] Harden the remaining BnF metadata behavior (outside the completed sessions).
- [ ] Add reliable complementary metadata for recent French editions absent from BnF.
- [x] Separate same-title BnF works with conflicting creators/publishers and prioritize explicit series relations.
- [x] Separate explicitly identified integral/omnibus notices from ordinary numbered volumes.
- [ ] Harden remaining series / volume / edition grouping.
- [x] Deduplicate BnF editions within existing work/kind groups and preserve selected library metadata.
- [ ] Validate cross-provider edition deduplication when complementary sources are added.
- [ ] Implement multi-source French cover selection with real image validation.
- [ ] Expand French BD/comics/manga automated tests and CI coverage.
- [ ] Run full integration/regression pass and prepare a release candidate for real VM testing.

## STATUS
Completed the edition-aware BnF deduplication NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `23497954a9b4eecb31ca6099ff78238d00e10332`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: edition-aware deduplication
- Within an existing work/edition-kind group, collapse notices only on a shared validated canonical EAN and matching ordinal (including null). ISBN-10 and its equivalent ISBN-13 identify the same edition.
- Keep different EANs and notices without valid ISBNs separate; title/ordinal equality alone never proves duplication. Conflicting ordinals remain separate even with the same ISBN.
- Choose duplicate representatives deterministically by existing metadata quality, then ARK; an explicitly selected ARK always wins its duplicate bucket and supplies the hydrated group's primary metadata.
- Catalog volumes retain distinct editions. `volumeCount` counts distinct explicit ordinals plus retained unnumbered editions; multiple editions of one numbered tome do not inflate the count.
- Hydration writes at most one row per ordinal: selected ARK first, existing row ARK next, equivalent existing ISBN/EAN next, otherwise the first deterministic catalog candidate for an unidentified/new row.
- If a known existing edition has no matching candidate, leave its row untouched rather than replacing it with another reissue.
- No database schema change. Null-number/compilation behavior remains unchanged.

### Exact verification: editions
Initial focused unit/integration tests: **8 failed, 4 passed (12 total)** before fixes.
Added one integration test for matching an existing ISBN-10 to its canonical EAN among multiple candidate editions; it passes.
All 13 new cases pass: duplicate editions across three title/kind variants; distinct ISBNs across two title/ordinal cases; two missing/invalid identifier cases; conflicting ordinals with a shared ISBN; order-independent representative choice; selected-ARK deduplication; repeated hydration with one row per ordinal; preservation of an absent existing edition; existing ISBN-10/EAN matching.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-editions.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **129 passed, 0 failed**, fourteen files (13 new plus 116 regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Mocked SRU and temporary SQLite only; no full suite, CI run, live-provider validation, Docker build or VM deployment.

### Intentional limits
Deduplication remains scoped to the existing work/publisher/creator/kind groups. Cross-provider deduplication is not implemented.
The library still stores one edition per ordinal; other editions remain in catalog results. There is no new edition-picker UI in this session.
No valid ISBN means no cross-ARK merge. Unnumbered editions cannot reliably establish a unique album count; they remain separately counted and are not persisted as numbered rows.
Matching EAN with a conflicting ordinal remains separate to avoid losing conflicting catalog information. No fuzzy identity or ISBN extraction changes were made.

## PREVIOUS SESSION: integral/omnibus separation
Completed the BnF integral/omnibus NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `8d468eb424a49e64d3d3c21ed9b7483f965485aa`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: integral/omnibus separation
- Detect `intégrale`/`integrale` (including plural) and `omnibus` in a notice's titles or declared types, ignoring accents/case. Descriptions and relations do not classify the edition.
- Keep compilation records in separate groups, visibly labeled `Intégrales / omnibus`; keep their original titles and identifiers.
- Set compilation individual-volume numbers to null, including when titles or relations supply a part number/range. Never expand contained volumes or infer ordinary-series ordinals.
- Preserve distinct compilation ARKs even with identical titles instead of discarding different ISBN editions.
- Selected-ARK hydration stays within the selected edition kind. Strip the display-only label before related SRU queries.
- Existing null-number hydration behavior skips compilation notices when writing numbered library rows; a real-client/temporary-SQLite test verifies existing volume records and known total remain unchanged.

### Exact verification: compilations
Initial two new files: **8 failed, 2 passed (10 total)** before the fix, including an integral overwriting an existing ordinary library volume.
An additional display-label query regression reproduced **1 failed, 9 passed** in the unit file on the intermediate implementation, then was fixed.
All 11 new tests now pass: three title variants; type-marked identical title; compilation range; distinct ISBN compilations with identical titles; ordinary album mentioning another integral in its description; both selected-ARK edition kinds; display-label query round trip; preservation of library rows/total.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **116 passed, 0 failed**, twelve files (11 new plus 105 regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Mocked SRU and temporary SQLite only; no full suite, CI run, live-provider validation, Docker build or VM deployment.

### Intentional limits
Classification is lexical: compilations without these title/type markers remain unrecognized, and an ordinary title containing the same words can be classified conservatively as a compilation.
Compilation part labels remain in their titles; the current model has no separate compilation-part numbering or mapping to contained tomes. They are visible in catalog results but not persisted as numbered library volumes.
At this checkpoint, different compilation ARKs were preserved even with matching ISBNs and ordinary groups chose one representative per ordinal/title. The subsequent edition-aware session above replaces that behavior with validated ISBN/EAN deduplication and distinct-edition retention.

## PREVIOUS SESSION: same-title work separation
Completed the same-title BnF grouping NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `0f1f38d773af5b2811f3a9a911c201af12f23e0f`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: same-title work separation
- Group by normalized series title, publisher and exact normalized primary-creator set before choosing representative editions.
- Creator normalization ignores case, accents, punctuation, duplicates and ordering. Contributors remain displayed but cannot establish work identity.
- Missing primary creators form a separate bucket, so they cannot bridge conflicting known authors; response order does not change this separation.
- Explicit `Titre d’ensemble` and `Appartient à` relations take precedence over album titles and query matching, including numbered albums.
- A `Collection` label alone does not override numbered album titles. Existing query-related heuristics for unnumbered albums remain.
- Conflicting publishers stay separate even with shared creators/relations. Hydration retains the selected ARK and excludes volumes from conflicting works.

### Exact verification: grouping
Initial eight focused tests: **6 failed, 2 passed** before the fix.
A ninth regression test then reproduced **1 failed, 8 passed** on the intermediate implementation: a shared publisher collection incorrectly merged different numbered series. Fixed by limiting authoritative relation labels to `Titre d’ensemble`/`Appartient à`; the conflicting-series fixture now uses the explicit `Titre d’ensemble` label.
All nine cases in `tests/server/integrations/bnf/grouping.test.ts` now pass: conflicting creators; conflicting publishers; explicit series precedence; conflicting series relations; missing-author bridge/order; normalized creator match; shared contributor with conflicting creators; selected-work hydration; publisher collection versus numbered series.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **105 passed, 0 failed**, ten files (9 new plus 96 regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Mocked provider responses and existing temporary SQLite tests only; no full suite, CI run, live-provider validation, Docker build or VM deployment.

### Intentional limits
Exact creator-set matching can split a genuine series when teams change or author metadata is incomplete. No fuzzy author identity or role matching is inferred.
Two same-title works lacking creator distinctions may still be indistinguishable. Unnumbered collection heuristics, ambiguous multiple relations and full edition deduplication are not validated by this session. Integral/omnibus handling was addressed in the subsequent session above.
Existing representative-edition selection still chooses one notice per ordinal/title within a group; this is not complete edition preservation.

## PREVIOUS SESSION: SRU response validation
Completed the BnF SRU response-validation NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `df4d057a29a605d6e5868bf2c946d96239588d07`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: SRU response validation
- Validate XML syntax before parsing; reject empty, plain-text, malformed and truncated bodies.
- Require a single object-valued `searchRetrieveResponse` envelope; reject HTML, bare records, unrelated envelopes and repeated response roots.
- Reject response-level `diagnostics`, including when records coexist with the diagnostic, before accepting any notice from that page.
- Report first-page protocol errors as `BnfError` status 502, including direct-ARK seed lookup (not a misleading 404).
- Preserve verified earlier pages on later-page protocol failures using the existing pagination error policy.
- Accept legitimate zero-result responses, namespace-prefixed SRU envelopes and XML declarations.

### Exact verification: SRU protocol
New tests before fixes: **15 failed, 8 passed (23 total)** in `tests/server/integrations/bnf/protocol.test.ts`; all 23 now pass.
The 10 response cases each run on the first and a later page: truncated XML, mismatched tags, empty body, plain text, HTML, wrong envelope containing records, bare records, multiple response roots, diagnostics alone, diagnostics with records.
Additional cases: legitimate empty result, namespace-prefixed envelope/XML declaration, direct-ARK protocol failure.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **96 passed, 0 failed**, nine files (23 new plus 73 regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Tests use mocked responses and existing temporary SQLite integration tests. No full suite, CI run, live-provider check, Docker build or VM deployment was performed.
Validation covers XML syntax, the response envelope and response-level diagnostics; it is not full SRU schema or individual bibliographic-record validation. Existing partial-result and pagination limits remain.

## PREVIOUS SESSION: bounded pagination
Completed the bounded BnF SRU pagination NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `3fc4b64251b905ad4ce1b2871bda4c8316c1e25e`.
Session date: 2026-09-26 (UTC).

### DONE: bounded pagination
- Follow explicit `nextRecordPosition` cursors, preserving query and schema.
- Stop on missing, repeated, backward, invalid or out-of-range cursors and empty pages.
- Limit each SRU lookup to five pages and one shared 20-second AbortSignal budget covering requests and response bodies.
- Deduplicate ARKs across pages, retaining the first parsed notice.
- Preserve earlier results on a later network, HTTP or body-read failure; propagate first-page errors.
- Existing language/identifier/grouping rules still apply to the accumulated notices.

### Exact verification: pagination
New focused tests before fixes: **16 failed, 1 passed (17 total)**.
All 17 now pass: three-page retrieval/query preservation; eight invalid/non-advancing/out-of-range cursor cases; duplicate ARKs; later network/HTTP/body failures; first-page HTTP failure; five-page cap; shared timeout budget; empty-page termination.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **73 passed, 0 failed**, eight files (17 new plus 56 existing regression tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Tests use mocked SRU responses; timeout verification injects an aborted signal without waiting 20 seconds. Existing hydration tests use temporary SQLite databases.
No full suite, CI run, live BnF check, Docker build or VM deployment was performed.

### Remaining pagination limits
Results can be partial when the cap/timeout is reached or a later page fails; the current return type has no completeness indicator.
A missing cursor ends retrieval; no continuation is guessed from `numberOfRecords` alone.
At this earlier checkpoint, SRU XML/diagnostic validation was unverified; the subsequent response-validation session above resolves malformed XML, non-SRU envelopes and response-level diagnostics.
The 20-second budget is per SRU lookup; hydration performs separate seed and related-notice lookups.

## PREVIOUS SESSION: French-language eligibility
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
- Do not repeat the completed within-group ISBN/EAN edition deduplication or library selection-preservation investigation without a new failing case; retain distinct editions and conservative no-ISBN behavior.
- Do not repeat the completed title/type-marked integral/omnibus separation without a new failing case; preserve null individual ordinals, catalog visibility, selected-ARK isolation and existing library rows.
- Do not repeat the completed same-title creator/publisher separation or selected-work hydration investigation without a new failing case; preserve the distinction between publisher collections and explicit series relations.
- Do not repeat the completed SRU syntax/envelope/response-diagnostic validation investigation without a new failing case.
- Do not reimplement or re-audit the completed bounded pagination without a new failing case; preserve its caps, partial-result behavior and ARK deduplication.
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
Add a French-only exact-ISBN complementary lookup for editions absent from BnF: select one suitable provider using its official API documentation and any existing integration, invoke it only after a successful BnF lookup yields no eligible exact edition, require a matching validated ISBN/EAN and explicitly French language, preserve source attribution and BnF priority, add focused fallback/foreign/mismatched-ISBN/error tests, run relevant tests, commit, update this checkpoint with one next action, and stop. Keep this step limited to ISBN lookup, not broad title/series supplementation or cover validation.

## RELEASE GATE
Do not provide production deployment steps until all required phases above are complete, relevant CI/tests pass, and the resulting branch is explicitly identified as a release candidate.

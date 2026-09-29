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
- [x] Add a BnF-first French exact-ISBN lookup with Open Library edition fallback.
- [x] Connect exact French ISBN lookup to Discover and verified edition-only library add.
- [x] Add bounded read-only BnF-first French edition title lookup with verified Open Library fallback.
- [x] Connect read-only French title results to Discover with explicit bounded coverage.
- [x] Connect title-result selection to the existing verified ISBN import flow.
- [ ] Validate remaining recent-edition coverage with bounded live bibliographic evidence.
- [x] Separate same-title BnF works with conflicting creators/publishers and prioritize explicit series relations.
- [x] Separate explicitly identified integral/omnibus notices from ordinary numbered volumes.
- [ ] Harden remaining series / volume / edition grouping.
- [x] Deduplicate BnF editions within existing work/kind groups and preserve selected library metadata.
- [x] Recognize existing comic-series/volume ISBN editions before BnF or Open Library exact-ISBN import.
- [ ] Validate remaining cross-provider catalog-result deduplication when title supplementation is added.
- [x] Validate existing BnF/DLP cover candidates at the image serving/cache boundary.
- [x] Implement ordered BnF-to-DLP cover fallback for the selected edition.
- [ ] Add provider-specific illustrated-placeholder fixtures/recognition.
- [x] Add a reproducible French regression command and dedicated CI gate (307 tests plus web TypeScript).
- [ ] Run full integration/regression pass and prepare a release candidate for real VM testing.

## STATUS
Completed the hydration provider-isolation NEXT ACTION on `chore/work-checkpoint-system`.
Verified test commit: `6775d36273558989893ba93773b1e90e0732a282`.
Session date: 2026-09-29 (Europe/Paris).

### DONE: hermetic ebook / Google Books hydration tests
- Initial Git state was clean at `ac20f9c` and matched the fetched branch. Preserved all existing work.
- In `ebook-hydrate-ol-fallback.test.ts`, explicitly mock Open Library work/alias and work-edition lookups with empty defaults; existing per-case provider responses and routing assertions still override these defaults.
- In `googlebooks-hydrate.test.ts`, explicitly mock targeted Google Books edition search and subsequent Open Library title search with empty defaults. Reapply these defaults after the stale-placeholder test restores mocks between its two hydrations.
- Both files block global fetch with a rejecting spy and assert zero calls after every test. Restore globals/spies and clean the temporary database in finally, even when the guard assertion fails.
- Preserved all existing behavior assertions, test cases and timeouts. No production hydration, provider client, dependency or global test configuration changed.

### Exact verification: hydration isolation
Commands from the repository root:
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/integration/jobs/ebook-hydrate-ol-fallback.test.ts tests/integration/jobs/googlebooks-hydrate.test.ts
corepack pnpm@9.15.0 check:french
```
First and final targeted run: **18 passed, 0 failed**, two complete files (8 ebook and 10 Google Books cases), 1.25 s. Every per-test zero-fetch assertion passed, including the three previously timed-out cases.
French gate: web TypeScript PASS; **405 passed, 0 failed**, thirty files, 6.07 s.
`git diff --check`: PASS. Compared existing test bodies with HEAD: unchanged except the single defaults reapplication after mid-test restore. No assertions were removed/weakened and no redundant new test cases were added.

### Remaining release limits
All thirteen failures from the recorded full-suite assessment now have targeted passing reruns (OpenAPI, Discover, hydration). This is not a fresh full-suite success: the next bounded step is the complete regression rerun to verify their combined state. Live coverage, illustrated-placeholder recognition and other incomplete phases remain open. No remote CI success, live provider probe, Docker operation, publishing workflow or VM access is claimed.

## PREVIOUS SESSION: Discover provider isolation
Completed the Discover provider-isolation NEXT ACTION on `chore/work-checkpoint-system`.
Verified test commit: `3899eadac82ac14bf17857ef356de8641393d9f0`.
Session date: 2026-09-29 (Europe/Paris).

### DONE: hermetic Discover search tests
- Resumed and preserved the uncommitted isolation work at `aca4288`; fetched branch still matched that HEAD. Completed the interrupted step without restarting the full-suite assessment.
- `apps/web/tests/server/api/discover/search.test.ts` explicitly mocks BnF series search and both MangaDex cross-link/title-completion paths with empty defaults. Individual existing test overrides remain supported.
- Stub global fetch with a rejecting spy and assert zero calls after every test, so swallowed provider errors cannot hide an accidental network attempt. Restore globals/spies and reset provider fetchers in a finally block, with existing temporary-database cleanup.
- All 35 existing test bodies, result/error/provider-gating assertions and timeout configuration are unchanged. No production source, dependency or global test configuration changed.

### Exact verification: Discover isolation
Initial guarded run: **32 passed, 3 failed**. The guard blocked attempted MangaDex title-completion requests in these existing cases:
- `collapses an AniList+NU same-title novel and keeps NU-only standalone`
- `records the NU error under "novelupdates" when NU fails in the fan-out`
- `novelupdates off: NU is not called and no NU results appear (contentType=all)`
Added the missing explicit `searchMangaTitles` mock; no real request escaped the guard and no existing assertion was weakened.

Final commands (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/api/discover/search.test.ts
corepack pnpm@9.15.0 check:french
```
Results: Discover **35 passed, 0 failed**, one file (6.98 s); French gate web TypeScript PASS and **405 passed, 0 failed**, thirty files (13.56 s). An earlier French gate also passed 405 tests before the final title-completion mock was added. The final gate finished before this interrupted session resumed; its complete saved output was checked rather than repeating it.
`git diff --check`: PASS. Compared all content from `function req` onward with HEAD: unchanged, confirming preservation of all existing test bodies/assertions. The zero-fetch afterEach assertion passed for every Discover case.

### Remaining failures and release limits
The nine Discover timeouts from the recorded full-suite run are resolved in the targeted rerun. The three ebook/Google Books hydration timeouts remain pending; no new full-suite or remote CI result is claimed. The OpenAPI fix remains preserved. Live coverage, illustrated-placeholder recognition and remaining release phases stay open. No live probe, Docker operation, publishing workflow or VM access occurred.

## PREVIOUS SESSION: website OpenAPI snapshot
Completed the OpenAPI snapshot synchronization NEXT ACTION on `chore/work-checkpoint-system`.
Verified snapshot commit: `64fbdf6557c59680bca911b4192f89256efbb3a7`.
Session date: 2026-09-29 (Europe/Paris).

### DONE: website OpenAPI snapshot
- Initial Git state was clean at `16b8ec1` and matched the fetched checkpoint branch. Preserved all existing work.
- Regenerated `apps/website/public/openapi.json` with the existing emitter and reviewed the complete diff: add the BnF ARK property/pattern, add the positive ComicVine ID constraint, remove ComicVine ID from required fields.
- The snapshot now matches the existing runtime comic-create schema. No runtime schema, handler, test assertion, dependency or generator change.
- Used the installed tsx import loader directly to run the same emitter, avoiding the previously documented CLI IPC issue and nested package-manager mismatch.

### Exact verification: OpenAPI snapshot
Generation from `apps/web`:
```bash
node --import tsx scripts/emit-openapi.ts ../../apps/website/public/openapi.json
```
Verification from the repository root:
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/openapi/snapshot-freshness.test.ts
corepack pnpm@9.15.0 check:french
```
Results: snapshot freshness **1 passed, 0 failed**, one file; French gate web TypeScript PASS and **405 passed, 0 failed**, thirty files. `git diff --check`: PASS. No additional tests were needed for a generated documentation artifact; the existing freshness assertion is unchanged.

### Remaining failures and release limits
The recorded OpenAPI mismatch is resolved by the focused rerun. The twelve provider-related timeouts from the prior full-suite assessment remain unresolved; no fresh full-suite result is claimed. Discover provider isolation is the next bounded step, with hydration isolation queued separately. Live coverage/illustrated-placeholder blockers and all other incomplete release phases remain open. No remote CI success, live provider probe, Docker operation or VM access is claimed.

## PREVIOUS SESSION: full web regression assessment
Completed the full web regression assessment NEXT ACTION on `chore/work-checkpoint-system`; the full-suite release check is FAIL, not release-ready.
Assessment commit: `b137dbd1f10ed5d18233e95d34dbf1dbf09aa614`.
Session date: 2026-09-29 (Europe/Paris).

### DONE: full web regression assessment
- Inspected the initial Git state. The existing local changes exactly matched the fetched checkpoint commit `37cda1e`; reconciled the local branch/index without discarding or changing those files. Assessed that commit with the existing dependencies/configuration.
- Full web unit/integration suite: **3,981 passed, 13 failed, 3 skipped**, across **555 passed, 4 failed, 1 skipped files** (560 total). Exit 1, 308.92 s, Node v24.19.0, pnpm 9.15.0, Vitest 4.1.8.
- `corepack pnpm@9.15.0 check:french`: web TypeScript PASS; **405 passed, 0 failed**, 30 files. This gate ran concurrently with the full suite; durations are not performance baselines.
- Twelve timeouts: nine in Discover search (eight BnF paths, one MangaDex enrichment) and three in ebook/Google Books hydration. Direct code/test inspection identified unmocked provider paths and pre-existing isolation gaps. These are environment-sensitive blockers, not proof of incorrect catalog results. No baseline suite rerun or successful provider response is claimed.
- One deterministic French-related documentation failure: the committed website OpenAPI snapshot omits BnF comic-create support already present in the runtime schema. Snapshot/test/schema are unchanged since the baseline; this is a pre-existing BnF API documentation inconsistency.
- Reproduction commands, classification evidence and limits: `docs/FULL_WEB_REGRESSION.md`. Machine-readable counts, non-passing files and all thirteen exact failure names: `docs/full-web-regression-2026-09-29.json`.
- Assessment consistency PASS (560 files, 3,997 tests, 13 named failures); `git diff --check` PASS. No behavior/test changes, added tests, suppressed assertions or increased timeouts.
- Existing suite paths can attempt real provider requests because they are not fully mocked. No separate live probe, publishing workflow, Docker operation or VM access occurred. Browser E2E and fresh remote CI were not run.

### Remaining failures
The OpenAPI snapshot is the next bounded fix. Discover provider isolation and hydration provider isolation remain queued separately. Prior live coverage and illustrated-placeholder limitations remain open. Passing the focused gate does not override the failed full suite, and the combined regression/release phase remains unchecked.

## PREVIOUS SESSION: bounded live bibliography check
Executed the bounded live bibliographic coverage NEXT ACTION on `chore/work-checkpoint-system`; live coverage remains BLOCKED / unverified from this workspace.
Evidence commit: `08c50b9660d1613c789e6575f655a0c171c648fe`.
Session date: 2026-09-28 (Europe/Paris).

### Observed: bounded live bibliography check
- Git was clean and matched the fetched checkpoint branch. Existing application work was preserved.
- Executed the existing read-only title lookup once for each of Les Cinq Terres, Ekhö and Les Légendaires using a reproducible capture script. Three BnF SRU GET attempts total; no retries or alternate transports/provider searches.
- Each first-page request reached the existing 20-second deadline before receiving an HTTP status/body. Lookup durations: 20,013 ms, 20,002 ms and 20,002 ms respectively. Native TimeoutError surfaced as BnfError.
- No edition was returned, so no exact-ISBN lookup or title-to-ISBN comparison was possible. Open Library was not called because BnF failure must not establish absence.
- Saved exact URLs/CQL, timestamps, errors and request/lookup timings in `docs/french-live-2026-09-28/report.json`; interpretation, limits and reproduction command are in `docs/FRENCH_LIVE_COVERAGE.md`.
- Added `apps/web/scripts/check-french-live.ts` solely for explicit read-only evidence capture; it is not part of CI or application behavior and refuses an existing output directory. It calls the completed provider functions, never imports library records or probes covers.
- The first tsx CLI launch failed before script/network execution with a temporary IPC socket `listen EPERM`. Executing Node with the installed tsx import loader succeeded; this did not repeat a provider request.
- No evidence distinguishes a workspace/network routing limitation from provider-side failure. Do not interpret these timeouts as empty catalogs, global BnF downtime or verified recent-edition coverage. The required coverage phase remains unchecked.

### Exact verification: live evidence
Executed from `apps/web`:
```bash
node --import tsx scripts/check-french-live.ts ../../docs/french-live-2026-09-28
```
Capture completed with three recorded failures and no skipped required title. No response-body files exist because no response was received.
Evidence consistency check: PASS (the three prescribed titles, exactly three requests, three native timeouts, no HTTP status or ISBN result fabricated).

Regression command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **405 passed, 0 failed**, thirty files. `git diff --check`: PASS.
No application behavior changed and no redundant tests were added. The script itself is included in web TypeScript validation. Mocked regression success is not a live coverage result.
No fresh remote CI success, full-suite run, browser review, Docker build, library import or VM deployment is claimed.

### Remaining limitation: live access
Resume the named live probes only with changed access conditions or new reproducible provider evidence. Preserve the strict failure policy; do not replace the timeouts with empty results or invent editions/ISBNs. Cover access/illustrated-placeholder limitations from the earlier investigation remain separate and were not probed again.

## PREVIOUS SESSION: verified title selection
Completed the title-selection-to-ISBN-import NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `ce46554300016c5733e1536067f1e8e4cf583b5c`.
Session date: 2026-09-28 (Europe/Paris).

### DONE: explicit title selection and fresh ISBN verification
- Discover now composes the two existing French panels through FrenchEditionDiscovery. Each identified title result offers `Vérifier cet ISBN avant ajout`.
- The handoff passes only the canonical ISBN, opens/scrolls to the existing ISBN panel and performs a fresh exact-ISBN GET. It never copies title-search metadata into an add request and never auto-adds.
- Show the currently verified title/source/ISBN and existing edition-only explanation before enabling the existing quality-profile/explicit add controls. A changed BnF/Open Library identity is shown from the new lookup; POST uses that displayed identity and the chosen profile.
- Re-selecting even the same ISBN performs another lookup and clears the prior verified edition/add result. Missing editions, provider errors and profile errors cannot offer stale title metadata for import. No profile means add remains disabled.
- Disable title selection during ISBN lookup/profile loading or explicit POST. A synchronous operation guard also blocks duplicate searches/adds. The same guard protects manual ISBN operations.
- Abort pending ISBN/profile reads on unmount and ignore late responses, including before starting a profile request. Add a visible ISBN verification loading status.
- Preserve the existing POST endpoint, server-side provider revalidation, duplicate checks, edition-only library semantics and existing-library link. No backend/schema/provider/catalog-merging change.

### Exact verification: title-to-ISBN handoff
Initial focused run: **31 passed, 1 failed**, three component files. The existing ISBN error test read the newly visible loading status before the error arrived. Changed it to wait for the same expected error text; no assertion was removed or weakened.
The first full gate, already running when that test synchronization fix was made, reported web TypeScript PASS and **404 passed, 1 failed** with the same loaded pre-fix assertion. The final rerun below loaded the corrected test.

All **11 new composed-component cases** pass: both verified providers (including title-result source changing to BnF); absent/provider/profile failures; repeated same-ISBN selection; POST 409/502 revalidation failures; blocked selection/duplicate add during POST; no profiles; unmount with a late ISBN response. Successful add tests assert the exact identity/profile payload and support an existing-library result.

Final command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **405 passed, 0 failed**, thirty test files (394 previous + 11 new). `git diff --check`: PASS.
The added cases live in the already-selected French title component file; no duplicate test selector was added. Tests use the real UI composition with mocked HTTP responses plus existing provider/SQLite/real-image regressions.
No live provider request, visual browser review, fresh remote CI success, full-suite run, Docker build or VM deployment is claimed.

### Intentional limits: verified selection
A title result is a discovery candidate. Exact-ISBN lookup may select another source/notice for the same canonical ISBN; the new result is visibly presented for the user's explicit add action. Unavailable exact-ISBN editions remain unimportable through this path.
Selecting another title is temporarily disabled while the current ISBN operation finishes; no queued or automatic add is introduced. Cancelling a browser read does not guarantee cancellation of upstream server work.
Catalog coverage, title supplementation/merging, provider-specific illustrated placeholders and tablet visual validation remain outside this step.

## PREVIOUS SESSION: read-only Discover title panel
Completed the read-only Discover French title panel NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `43615aa2f3b8769ca90248bda3e9d19dcbb278ef`.
Session date: 2026-09-28 (Europe/Paris).

### DONE: Discover French title panel
- Added the expandable `Éditions françaises par titre` panel to Discover alongside the existing exact-ISBN form.
- Explicit submission calls only the completed read-only title endpoint. Trim/validate 2–200 characters, encode the title with URLSearchParams and reuse apiFetch authentication handling. Opening the panel alone makes no request.
- Display each edition's title, canonical ISBN, French language and linked provider attribution. Preserve separate same-title editions and the server result order; no client-side grouping or provider inference.
- Explain BnF priority, limited/non-exhaustive coverage and that results do not establish a complete series or comic genre. Empty results explicitly allow for other existing editions; provider/network/JSON failures show a retryable error rather than absence.
- Announce loading, completion and errors with status/alert semantics. Disable input/submission during a request, guard against duplicate submissions and abort pending client work on unmount. Ignore aborted late responses.
- Clear old results on input changes and new submissions. Use a wrapping form and a height-limited, keyboard-focusable scrolling result list.
- No add button, quality-profile lookup, library write, provider change or import behavior in this panel. Existing exact-ISBN flow is preserved.
- Added the new component test file to test:french and extended the existing Discover mount assertion to verify both French panels are present.

### Exact verification: Discover title panel
Initial focused command (new component plus existing Discover tests): **18 passed, 1 failed**, two files. The empty-state test observed the legitimate loading status before the promise completed; changed it to wait for the expected empty-state text. No product assertion was removed or weakened.
All **15 new component cases** now pass: initial/no-network behavior; both provider attributions; same-title distinct editions; bounded empty state; four retryable failure variants; editing clears results; loading/duplicate submission; unmount/late response; three invalid input cases.

Final command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **394 passed, 0 failed**, thirty test files (379 previous + 15 new). `git diff --check`: PASS.
Verification uses jsdom/mocked requests and the existing provider/SQLite/real-image regression coverage. No live provider request, visual browser review, fresh remote CI success, full-suite run, Docker build or deployment is claimed.

### Intentional limits: title panel
The panel is read-only and does not yet transfer a selected result into the existing exact-ISBN add flow. The completed backend fallback/coverage limits remain unchanged. A displayed edition count is the number returned by this bounded search, not a series volume total.
Responsive CSS is present but has not been visually tested on the user's Android tablet. No covers were added to the new panel.

## PREVIOUS SESSION: bounded French edition title search
Completed the bounded read-only French edition title-search NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `873a5b4d4e90d4d6a6d9fac68dea488d4dfd3247`.
Session date: 2026-09-27 (Europe/Paris).

### DONE: French edition title fallback
- New read-only `GET /api/discover/french-title?title=...` validates one trimmed title of 2–200 characters, returns `{ source, coverage: "bounded", results }`, rejects invalid/duplicate input with 400 and reports provider failures as 502.
- Reuse BnF title search/grouping and confirmed-French rules; return its editions with validated canonical EANs first. Activate Open Library only if that successful search yields no eligible identified edition.
- Opt this new caller into the existing strict SRU failure/page-cap policy. First/later-page failures and exhausted pagination do not establish absence. Existing ordinary BnF search callers retain partial-result behavior.
- Open Library searches by title with `lang=fr` and requests nested edition keys. Work/search metadata only nominates candidates; fetch `/books/OL…M.json` and independently verify the returned key, nonblank title, edition-level French-only language and valid book ISBN.
- Reuse the exact-ISBN eligibility rules and canonical identifier validator. No French inference from a title, work, publisher, ISBN prefix or language preference parameter. ISBN-10 and equivalent ISBN-13 collapse to one canonical EAN; conflicting valid EANs in a candidate are rejected because no input ISBN can disambiguate them.
- Examine at most five search documents and fetch at most five unique edition keys. No pagination, retry, author/work expansion or arbitrary provider URL following. A shared 15-second Open Library budget includes rate-limit waits, headers and bodies; each network request has a five-second deadline. Abort-aware races also bound non-cooperating injected fetchers; no new candidate starts after timeout.
- Skip invalid/missing edition records, retain the first verified candidate per canonical EAN, and keep different EANs even when titles match. HTTP/network/JSON failures fail the lookup instead of presenting accumulated results as complete success.
- Share provider result formatting with exact-ISBN lookup to preserve attribution, edition ID, source URL and language. Open Library results retain unknown ordinal and no accepted cover. No work-level metadata is copied into the edition result.
- Added the new standalone endpoint test to the existing `test:french` selection; adapter tests are covered by its existing Open Library directory selector. No UI/import/schema/placeholder/deployment behavior added.

### Exact verification: title search
Initial focused run: **50 passed, 0 failed**, two new files (34 adapter tests, 16 endpoint tests).
Coverage includes BnF priority/error/page-cap handling, input validation, provenance, edition-language and ISBN exclusions, legacy identifiers, conflicting identifiers, exact edition-key verification, same-ISBN deduplication, distinct editions, candidate caps, unsafe paths, 404 behavior, provider failures, stalled headers/body and the shared deadline.

The first `check:french` attempt stopped at TypeScript: extracting provider result formatters narrowed the BnF result type, exposing a fixture that explicitly supplied the Open Library-only `publishDate` field as undefined. Updated that fixture to omit the field; no assertion or production acceptance rule was weakened. The suite had not run in that failed gate attempt.

Final command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **379 passed, 0 failed**, twenty-nine test files (329 previous + 50 new). `git diff --check`: PASS.
Tests use mocked provider responses, fake deadline timers and the existing real temporary-SQLite/image regression coverage. No fresh remote CI success, live catalog coverage benchmark, full-suite run, Docker build or deployment is claimed.

### Intentional limits: title search
This is an empty-result fallback, not supplementation of a nonempty BnF bibliography: any eligible BnF result suppresses Open Library. Cross-provider result merging remains unimplemented. Existing BnF grouping/selection and no-cursor termination limits are unchanged.
The bounded Open Library candidate sample is not exhaustive, has no pagination UI and does not guarantee recent-release coverage. Its search index may nominate only one edition per work; `lang=fr` influences selection but does not establish language. Missing/inconsistent edition metadata can exclude genuine French books.
Open Library confirms French edition metadata, not comic genre, series membership or semantic title identity. No automatic comic classification/import/monitoring is introduced. The endpoint is not yet connected to Discover's UI; existing exact-ISBN lookup/import remains available.
The Open Library budget starts after the existing bounded BnF lookup (up to 20 seconds); there is no single shared deadline across both providers. No new provider cache or retry policy was introduced.

### Documentation consulted for this scoped implementation
- https://openlibrary.org/dev/docs/api/search — title parameter, nested edition candidates, language preference and documented edition-selection limitations.
- https://openlibrary.org/dev/docs/api/books — edition document API context.
Read on 2026-09-27; documentation retrieval is not a successful live catalog lookup.

## PREVIOUS SESSION: existing-volume edition detection
Completed the existing-volume ISBN/EAN duplicate-check NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `33faeb7888bba61eabfc3ed7653a4dfc44cbacf4`.
Session date: 2026-09-27 (Europe/Paris).

### DONE: existing-volume edition detection
- After provider revalidation, quality-profile validation and the existing series-level ISBN check, inspect volume metadata joined only to comic parent series before inserting an edition-only entry.
- Reuse the completed book identifier validator to canonicalize string `isbn`/`ean` values, including legacy hyphenated ISBN-10 and ISBN-13.
- An exact canonical match returns the existing parent series with `created: false` (HTTP 200). No series, volume, cover, provenance, monitoring or job records are modified.
- Parse legacy JSON defensively: malformed JSON, null/scalar/array metadata and non-string identifier values cannot establish a match. A valid field can match when the other field is invalid/missing; two different valid canonical identifiers are contradictory and cannot establish a match.
- Different editions and same-title records without a matching valid identifier remain distinct. Matching identifiers under ebook parents do not suppress comic imports.
- Keep checks and insertion inside the existing write lock. Concurrent BnF/Open Library adds against a represented edition return the same existing series. Provider missing/changed/failure behavior remains enforced even if the volume is already present.
- No schema, provider, placeholder, deployed-instance or unrelated behavior changes.

### Exact verification: volume duplicates
Before the fix, the focused integration file reported **7 failed, 23 passed** (30 cases total): both provider cases and five identifier variants reproduced unwanted series insertion.
All **22 new cases** now pass: 2 provider/concurrent-add/full-record-preservation cases; 5 valid legacy identifier variants; 11 malformed/different/contradictory metadata variants; 1 ebook isolation case; 3 revalidation failures with an existing volume.

Final command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **329 passed, 0 failed**, twenty-seven test files (307 previous + 22 new). `git diff --check`: PASS.
Tests use mocked provider lookup with real temporary SQLite and complete before/after snapshots for preservation assertions. No fresh remote CI result, live provider request, full-suite run, Docker build or deployment is claimed.

### Intentional limits: duplicate checks
Volume matching reads string `isbn` and `ean` in the existing top-level metadata JSON only; it does not infer identifiers from descriptions, filenames or nested provider payloads.
The existing canonical series-level ISBN check remains first. If the same edition already exists in several parent series, volume matches use ascending series/volume IDs; this step returns an existing series without repairing or merging existing duplicates.
The volume query selects metadata/parent IDs for comic volumes under the write lock; this is a linear scan, not an indexed identifier table. Very large libraries may need a dedicated normalized index in a separate measured optimization.
This is import idempotence, not fuzzy cross-provider catalog deduplication or proof that a local file has been acquired. A valid identifier is the available edition evidence; contradictory valid fields intentionally prevent a match.

## PREVIOUS SESSION: provider-placeholder investigation
Executed the provider-placeholder investigation NEXT ACTION on `chore/work-checkpoint-system`; recognition remains BLOCKED pending verified image samples.
Evidence commit: `19538e36c8c6ee05e6d59b7cf2acdd42102d7034`.
Session date: 2026-09-27 (Europe/Paris).

### Observed: provider-placeholder capture
- Initial Git state was clean and matched the fetched checkpoint branch. All valid existing implementation work was retained.
- Made bounded read-only requests from the development workspace to the two existing cover services. Full URLs, request conditions and evidence are recorded in `docs/FRENCH_COVER_PLACEHOLDERS.md`.
- BnF synthetic missing-ARK probe returned HTTP 500 twice; the captured response was 5,899 bytes of HTML, not an image. Its SHA-256 is recorded for provenance only, never as an image denylist entry.
- DLP synthetic checksum-valid EAN probe returned HTTP 404 initially (body not captured), then timed out. The existing test-EAN control request also timed out. An auxiliary web retrieval tool could not access the synthetic-probe URLs.
- These inputs are probes, not verified real missing-cover editions. No illustrated placeholder or successful genuine-cover control was obtained, so no provider-specific image fixture, fingerprint or heuristic was invented.
- Provider access/response limitations prevent completing illustrated-placeholder recognition in this session. The required phase remains unchecked; this follows the checkpoint's explicit failure-to-obtain-samples provision.
- No decoder, fallback, cache, metadata, CI or VM behavior changed. No redundant HTTP/HTML tests added: the completed regression suite already covers these rejection paths.

### Exact verification: placeholder investigation
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS; **307 passed, 0 failed**, twenty-seven test files. `git diff --check`: PASS.
These tests verify the existing decoding/genuine synthetic-image/fallback behavior; they do not establish recognition of provider-specific illustrated placeholders.
No fresh remote CI result, full-suite run, Docker build or deployment is claimed. Previous verified CI results remain recorded below.

### Remaining limitation
Resume provider-specific recognition only with newly accessible, reproducible samples or supplied original provider responses with provenance. Do not repeat these exact unsuccessful probes without changed evidence. Generic rejection and edition-bound BnF/DLP fallback remain available, but illustrated error graphics can still pass decoding.

## PREVIOUS SESSION: French catalog CI gate
Completed the focused French-catalog CI NEXT ACTION on `chore/work-checkpoint-system`.
Verified code/configuration commit: `f46a6e4de41ae72802f010bd326ed7594213e3d9`.
Session date: 2026-09-27 (Europe/Paris).

### DONE: French catalog CI gate
- Root command `corepack pnpm@9.15.0 check:french` runs web TypeScript then the focused French regressions; either failure fails the command.
- Web `test:french` holds the single shared list of fourteen test selectors covering the completed metadata, import, UI, provider fallback and image behavior. No tests/assertions were weakened or removed.
- New `.github/workflows/french-catalog.yml` runs on pushes to `chore/work-checkpoint-system`, all pull requests (including shared-code changes) and manual dispatch, without path filters.
- Uses existing workflow conventions: Ubuntu, Node 22, pnpm 9.15.0, frozen lockfile and a fifteen-minute job limit. Obsolete runs on the same ref are cancelled.
- Read-only contents permission, no persisted checkout credentials, no Docker build/publication/deployment steps. The existing release/publishing workflow was not changed or manually dispatched.
- Added `docs/FRENCH_CATALOG_CI.md` with local commands, scope, trigger behavior and the distinction between the focused gate and release approval.
- Branch-protection requirements were not modified; the workflow exposes the status `French catalog - typecheck and regressions` but does not itself require it for merging.

### Exact verification: CI
Initial root-command attempt failed before TypeScript/tests: plain nested `pnpm` resolved to the environment's different global version and aborted an attempted dependency reinstall (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). No test failure count applies. Fixed both child commands to explicitly use `corepack pnpm@9.15.0`; no dependencies or lockfile changes were needed.

Final local command:
```bash
corepack pnpm@9.15.0 check:french
```
Result: web TypeScript PASS, **307 passed, 0 failed**, twenty-seven test files, using local Node 24.19.0.
Parsed workflow YAML and checked triggers, permissions, job/action/version configuration, exact command wiring, all fourteen existing test selectors, and absence of `--passWithNoTests`: PASS.
`git diff --check`: PASS. No local actionlint binary was available; actual GitHub execution below validates the workflow as well.

Remote GitHub Actions on code commit `f46a6e4de41ae72802f010bd326ed7594213e3d9`:
- Push run **36310878371**: completed / **success** — https://github.com/mannixteam/bookkeeprr/actions/runs/36310878371
- Pull-request run **36310881478** (existing PR #1): completed / **success** — https://github.com/mannixteam/bookkeeprr/actions/runs/36310881478
- Both jobs completed dependency installation and `Check French catalog` successfully under the configured Node 22 environment. Retrieved push-job logs confirm **307 tests / 27 files passed**.
- The initial status/run query returned empty while runs were being created; subsequent REST run/job reads confirmed both successes. This is not an access limitation.

No full-suite result is claimed: existing general CI/Website workflows also trigger on the PR, but were not investigated in this scoped step. No live provider coverage, Docker build, release or VM deployment was performed. The final checkpoint-only commit can trigger fresh runs; the verified results above refer exactly to the code commit.

## PREVIOUS SESSION: ordered cover fallback
Completed the ordered BnF/DLP cover fallback NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `9fed41a10026b6b1ccb13e8129642d4db7d35fcd`.
Session date: 2026-09-27 (Europe/Paris).

### DONE: edition-bound cover fallback
- BnF search, exact-ISBN lookup and hydration now generate a local `/api/img?bnfArk=...&ean=...` image URL from the same selected notice. The optional EAN is already canonical; missing identifiers never trigger title matching or another edition's ISBN.
- The image endpoint builds exactly two possible candidates, in order: BnF ARK service, then DLP canonical-EAN service. Without an EAN, only BnF is tried.
- Each candidate uses the completed French image decoder/downloader/cache path. Advance only after failure/rejection; stop at the first validated image. Both failures return 502/no-store and the existing UI fallback.
- Validate ARK syntax and canonical EAN at the endpoint; reject malformed/duplicate identifier parameters or mixed `u`/edition requests before network access.
- Successful edition image responses include `x-cover-source` (`bnf` or `dlp`) and `x-cover-source-url` for the accepted candidate, also on cache hits. Cross-host redirects are rejected by this serving path so a redirect cannot silently switch the attributed provider.
- Hydrated volume metadata stores the ordered `coverCandidates`; `coverSource` and `coverRetrievedAt` are null until an actual image retrieval. Removed the prior unconditional BnF attribution and fabricated image-retrieval date from bibliographic hydration.
- Reuse per-candidate validated caches. BnF is tried before a cached DLP fallback; purging an edition URL expands to both candidate URLs. Local edition URLs pass through the Cover component unchanged.
- The selected series cover and volume cover keep the same selected ARK/EAN despite newer reissues. No database migration, additional provider, metadata supplementation or production changes.

### Exact verification: ordered covers
First focused run: **103 passed, 0 failed**, seven files (image tests, ISBN tests and edition hydration). TypeScript passed.
Final run includes **18 new cases**: 16 endpoint fallback/identity/provenance cases, one selected-edition hydration case, one component local-URL case.
Updated existing ISBN cover-URL assertions to check the new exact ARK/EAN route, including no EAN parameter for invalid ISBNs; identifier assertions remain intact.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/images tests/components/french-cover.test.tsx tests/components/french-isbn.test.tsx tests/components/discover-empty.test.tsx tests/integration/jobs/french-edition-add.test.ts tests/server/discover/french-isbn.test.ts tests/server/integrations/openlibrary tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-editions.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **307 passed, 0 failed**, twenty-seven files (289 previous + 18 new).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Tests use generated real image bytes, mocked upstream requests, fake deadline timers, jsdom and temporary SQLite. No live-provider request, visual browser review, full suite, remote CI verification, Docker build or VM deployment.

### Intentional limits: ordered covers
Attribution records the accepted candidate provider/URL in the HTTP response; no image fetch updates the database and no UI source badge was added. Database cover fields describe candidates, not a persisted successful selection.
Existing stored single-source URLs continue to work but gain both candidates only after normal BnF metadata hydration; no bulk migration runs. The separate exact-ISBN edition-only add path continues to leave covers unset.
The endpoint validates identifier syntax, not the bibliographic association of arbitrary manually supplied ARK/EAN pairs. Application-generated pairs come from one selected BnF notice; image retrieval makes no database writes.
Two sequential candidates can take two download budgets (up to 8 seconds each), plus decoding/encoding and cache operations. Failed BnF requests are not negatively cached; browser success caching retains the selected image for the existing one-day TTL.
Provider-specific illustrated-placeholder recognition and semantic proof of cover/edition identity remain unimplemented, as documented in the previous session. No claim of universal placeholder rejection or live provider coverage is made.

## PREVIOUS SESSION: real-image validation
Completed the real-image validation NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `e012bbdd7ddc340ef201133eed41aff1a07d982d`.
Session date: 2026-09-27 (Europe/Paris).

### DONE: real-image acceptance
- Existing BnF ARK-service and DLP ISBN candidates always use `/api/img` through the shared Cover component and library/mobile URL helpers, even with disk caching disabled. Fixed the missing DLP proxy allowlist entry.
- French hosts have a dedicated acceptance path: HTTP 200, image MIME, then actual full-pixel decoding with Sharp. Reject HTML disguised as an image, empty/signature-only/corrupt/truncated files, unsupported formats and multipage/animated images.
- Accept JPEG, PNG, WebP, single-frame GIF and AVIF; require at least 80 x 100 pixels and at most 20 million pixels. Normalize accepted pixels to JPEG and derive the served content type from that output.
- Cap streamed input and encoded output at 8 MiB. An 8-second download deadline covers headers, allowed redirects and body reads; enforce actual streamed size even if Content-Length is absent/false. Cancel rejected streams. Decode and encode each have a 3-second Sharp processing limit.
- Follow at most three redirects, only HTTPS to the two existing French cover hosts, without URL credentials. Reject explicit placeholder/no-cover/no-image/image-indisponible destinations, tiny sentinels, fully transparent and single-colour blank responses.
- Validation failure returns 502/no-store; the existing Cover fallback is shown. Failed responses are never written to cache.
- Separate `fr-v1-<url-hash>.jpg` cache namespace ignores all pre-validation cache entries; cached bytes are size-checked and decoded again. Invalid entries retry upstream. Atomic cache writes and purge support retained; cache-write failures still serve the validated image.
- Declare Sharp 0.34.5 directly, reusing the exact version already present in the lockfile/runtime. No schema or BnF bibliographic parsing changes.

### Exact verification: image acceptance
Initial focused decoder run: **31 passed, 1 failed** (AVIF metadata is reported as HEIF/AV1). The first image-directory run repeated that failure: **67 passed, 1 failed**. Fixed the format check without removing the AVIF assertion.
New tests: **42 passed** (32 decoder/download cases, 8 proxy/cache cases, 2 component routing/fallback cases). Fixtures use deterministic generated image bytes and mocked responses; actual Sharp decoding runs in tests.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/images tests/components/french-cover.test.tsx tests/components/french-isbn.test.tsx tests/components/discover-empty.test.tsx tests/integration/jobs/french-edition-add.test.ts tests/server/discover/french-isbn.test.ts tests/server/integrations/openlibrary tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-editions.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **289 passed, 0 failed**, twenty-seven files (219 previous targeted cases, 28 existing image cases, 42 new).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck`, `git diff --check` and `corepack pnpm@9.15.0 install --lockfile-only --offline --frozen-lockfile --ignore-scripts`: PASS.
The initial offline `pnpm add` could not resolve registry metadata; added the direct importer entry using the existing locked Sharp package, then verified the frozen lockfile.
No live-provider request, browser visual review, full suite, remote CI verification, Docker build or VM deployment.

### Intentional limits: covers
Validation happens on demand before serving/caching; BnF metadata/database cover URLs remain candidates, not proof that the image exists. A failed candidate currently shows the fallback card; there is no alternate-source retry yet.
Placeholder rejection covers the explicit missing-image URL patterns and blank/tiny/transparent classes above. No captured provider-specific illustrated placeholder hashes or semantic cover/edition verification exist; an otherwise valid illustrated error graphic can still pass. Uniform-colour artwork can be conservatively rejected. No claim of universal placeholder recognition is made.
The source list remains the two existing BnF/DLP candidates. The exact-ISBN edition-only import still leaves its cover unset. Other providers retain their previous image behavior.
Revalidating cached images costs decoding/encoding work. The download deadline and processing limits are separate, not one total request deadline. Disk cache lifetime/refresh policy and request concurrency limits remain unchanged.

## PREVIOUS SESSION: Discover ISBN edition flow
Completed the Discover/verified-edition-add NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `14243e0b1fc763bbc9741ce604fbcd7144f3b19f`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: Discover ISBN edition flow
- Discover includes an expandable `Édition française par ISBN` form using the completed lookup endpoint.
- Results show the edition title, canonical ISBN, French language and linked source attribution; users choose a quality profile and explicitly add the edition as BD/comic/manga.
- New POST on `/api/discover/french-isbn` accepts only ISBN, selected source/ID and quality-profile ID. It re-runs the existing verified lookup; missing/changed editions return 409 and provider failure returns 502 without writes.
- Forged client title/language/ARK fields are ignored. Invalid ISBN/profile is rejected.
- Persist canonical ISBN in `series.isbn`; retain French language, attribution, provider edition ID and source URL in the persistent description. No fabricated BnF marker or Open Library work ID is stored.
- Store an edition-only comic library entry with unknown totals, no numbered rows, monitoring disabled and no hydration/download jobs. Root path uses the configured comic media root, sanitized title and canonical ISBN.
- Serialize duplicate check/insert with the existing DB write lock. Repeated/concurrent adds of the same canonical ISBN in the comic library return the existing row, without replacing its metadata.
- Link to the new/existing library entry and refresh the library route cache after success. No database migration.

### Exact verification: Discover/import
The first focused run reported **2 failed, 35 passed**: both failures were unsupported DOM assertion helpers in the new component tests. Replaced them with equivalent attribute/text assertions supported by this repository.
Added a BnF edition-only import case; TypeScript caught an Open Library-only date field in its fixture, corrected to undefined. No product assertions were removed or weakened.
New tests: **10 passed** (2 component flow/error tests + 8 temporary-SQLite import cases including both providers, concurrency, revalidation failures, forged metadata, bad profile and invalid ISBN).

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/components/french-isbn.test.tsx tests/components/discover-empty.test.tsx tests/integration/jobs/french-edition-add.test.ts tests/server/discover/french-isbn.test.ts tests/server/integrations/openlibrary tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-editions.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **219 passed, 0 failed**, twenty-one files (205 previous + 4 existing Discover UI tests + 10 new).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS after the fixture correction.
Verification uses jsdom, mocked providers and temporary SQLite. No browser visual review, full suite, CI run, live-provider check, Docker build or VM deployment.

### Intentional limits
Exact-ISBN entries represent a selected edition, not a complete series. They have no inferred ordinal and no automatic downloads; this is stated in the UI.
Open Library does not prove comic genre; the user's explicit BD/comic/manga add action classifies the entry.
Language/provider provenance are preserved in the human-readable description, not dedicated queryable columns. No edition refresh or series-association UI was added.
Duplicate checking covers canonical ISBNs already stored in comic `series.isbn`; legacy entries without a series-level ISBN and volume-level ISBNs are outside this check.
No image acceptance/cover validation was added; the new edition import leaves the cover unset.

## PREVIOUS SESSION: exact-ISBN fallback
Completed the French-only exact-ISBN complementary lookup NEXT ACTION on `chore/work-checkpoint-system`.
Verified code commit: `368201b9f15ab0400e3e21422cdf674cd4923b79`.
Session date: 2026-09-26 (Europe/Paris).

### DONE: exact-ISBN fallback
- New read-only endpoint: `GET /api/discover/french-isbn?isbn=<ISBN-10-or-13>`, with `{ result }` (edition or null), 400 for invalid ISBN and 502 for provider failure.
- Canonicalize/check the ISBN using the existing validator; query BnF first and require an exact eligible French comic edition before accepting its result.
- Call Open Library only after BnF succeeds without an eligible exact edition. BnF network/HTTP/XML and later-page failures do not activate fallback. A paginated lookup that exhausts its page budget with a continuation also fails rather than asserting absence.
- Ordinary BnF title searches retain their existing partial-result behavior; strict lookup is limited to this new path.
- Reuse Open Library's existing injectable fetcher/rate limiter with one ISBN-edition request, no retry and a 5-second signal covering headers/body.
- Require a valid edition key, title, matching validated ISBN/EAN, and nonempty edition-level languages entirely `/languages/fre` or `/languages/fra`. Reject unknown/missing/foreign/bilingual language and mismatched/invalid/missing identifiers.
- Preserve provider ID, source URL and attribution. Open Library never receives a fabricated BnF ARK; no work-level language/ISBN inference occurs.
- No cover is accepted from Open Library in this step (`coverUrl: null`); no tome ordinal or complete series is inferred (`number: null`).

### Provider choice and official documentation
Open Library already has an integration in this repository and supplies edition-level ISBN lookup without introducing new API-key configuration. Its official docs distinguish works from editions and document `/isbn/<isbn>.json`:
- https://openlibrary.org/dev/docs/api/books (ISBN API and Works versus Editions)
- https://openlibrary.org/about/work_edition (edition metadata fields)
Read on 2026-09-26. Documentation retrieval was performed, not a live catalog coverage benchmark. Google Books was not added to this fallback; the existing client notes production keyless-quota failures.

### Exact verification: fallback
Initial test collection failed because the new endpoint did not exist (one failed suite, zero executed tests); no pre-fix assertion count is claimed.
After implementation, the first 23 new tests passed. An added page-cap regression reproduced **1 failed, 23 passed**, then was fixed.
All **24 new endpoint tests** pass: BnF priority; empty result fallback/attribution/ISBN-10 input; two ineligible BnF cases; six rejected fallback cases; equivalent returned ISBN-10; three BnF errors; later BnF page failure; four fallback errors; fallback 404; three invalid inputs; BnF page-cap failure.

Final targeted regression command (repository root):
```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run tests/server/discover/french-isbn.test.ts tests/server/integrations/openlibrary tests/server/integrations/bnf tests/server/french-comics-bnf.test.ts tests/integration/jobs/bnf-editions.test.ts tests/integration/jobs/bnf-compilations.test.ts tests/integration/jobs/bnf-language.test.ts tests/integration/jobs/bnf-unnumbered.test.ts tests/integration/jobs/metadata-hydrate.test.ts
```
Result: **205 passed, 0 failed**, eighteen files (24 new + 129 previous targeted regressions + 52 existing Open Library tests).
`corepack pnpm@9.15.0 --filter @bookkeeprr/web typecheck` and `git diff --check`: PASS.
Mocked provider responses and temporary SQLite regressions only; no full suite, CI run, live-provider coverage validation, Docker build or VM deployment.

### Remaining limits
At this checkpoint the endpoint was read-only; the subsequent Discover/import session above connects it to the UI and adds POST. No existing broad title search behavior was changed.
Open Library fallback proves exact French edition identity, not comic genre or series membership; the response must not be silently treated as a complete comic series. Missing language metadata intentionally reduces coverage.
No cross-provider title merging, cover validation, edition hydration/import, or general recent-release coverage claim is made. Existing SRU no-cursor/invalid-cursor termination rules remain unchanged.

## PREVIOUS SESSION: edition-aware deduplication
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
- Preserve the hydration provider defaults, zero-fetch guards and finally cleanup in both fixed integration files. Do not repeat the completed isolation investigation without a new failure.
- Preserve the Discover BnF/MangaDex mocks, per-test zero-fetch guard and finally cleanup. Reuse the passing 35-case regression file; do not repeat its completed isolation investigation without a new failure.
- Preserve the regenerated website OpenAPI snapshot and existing freshness assertion. Do not repeat its completed synchronization without a runtime-schema change or new failing freshness test.
- Reuse the 2026-09-29 full-suite assessment and exact failure inventory; do not repeat the broad assessment before addressing a recorded failure. The OpenAPI snapshot mismatch was resolved by commit `64fbdf6` and its focused rerun; the nine Discover timeouts were resolved by the targeted isolation fix/rerun above. The three hydration timeouts were resolved by `6775d36` and the 18-case targeted rerun. A combined full-suite rerun is now required; preserve the original assessment as historical evidence.
- Do not repeat the recorded 2026-09-28 live title probes for Les Cinq Terres, Ekhö and Les Légendaires without changed access or new provider evidence. Preserve `docs/FRENCH_LIVE_COVERAGE.md` and the raw trace; live coverage and title-to-ISBN comparison remain unverified, not empty or successful.
- Preserve the completed explicit title-to-ISBN handoff: transfer only ISBN, re-fetch before showing add controls, retain the fresh identity/profile payload, prevent overlapping operations and never auto-add a title result. Reuse the composed-component tests and existing server revalidation/idempotence.
- Preserve the completed read-only Discover French title panel, explicit limited-coverage wording, source links, loading/error/empty states and request lifecycle guards. Reuse its component tests; do not recreate the panel or silently convert editions into complete series.
- Preserve the completed bounded read-only French title endpoint and Open Library edition validation, BnF-first strict-error policy, request caps/deadlines, identifier deduplication and provenance. Reuse its tests and result contract; do not repeat provider selection or infer language from search/work metadata.
- Preserve the completed volume-level ISBN/EAN duplicate check in French edition-only add, including legacy normalization, contradictory-identifier rejection, comic-only scope, provider revalidation and no-write reuse under the existing lock. Do not repeat its investigation without a new failing case.
- Do not repeat the recorded 2026-09-27 BnF/DLP synthetic placeholder probes without improved access or new verified response samples. Preserve the unresolved illustrated-placeholder requirement; never treat the HTML error hash or generated test artwork as a provider placeholder.
- Reuse `corepack pnpm@9.15.0 check:french` and the completed dedicated workflow for French regressions; update its single test selection as new standalone cases are added. Do not re-create the CI gate or manually dispatch the publishing workflow for test-only work.
- Reuse the completed edition-bound BnF-first/DLP-second image endpoint and candidate cache/purge behavior. Keep selected ARK/EAN together and do not reinstate unconditional BnF cover attribution during metadata hydration.
- Reuse the tested French image decoder, bounded downloader and mandatory BnF/DLP proxy path; do not repeat the completed image-validation work. Keep its documented placeholder/identity limits explicit when adding source selection.
- Reuse the completed Discover exact-ISBN form and revalidated edition-only add path; preserve provenance, unknown totals, disabled automatic monitoring and concurrent-add idempotence.
- Reuse the completed exact-ISBN endpoint, Open Library adapter and BnF-first/error policy; do not repeat provider selection or the completed fallback investigation without a new failing case.
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
Run the existing full web unit/integration regression suite and `check:french` in the isolated development workspace to verify the combined OpenAPI, Discover and hydration fixes. Record exact pass/fail/skip counts and any concrete remaining failures in a new assessment, preserving the original 2026-09-29 evidence. If a failure remains, inspect only its directly relevant code/tests to choose one bounded next action; do not start another fix or repeat completed audits. Commit the assessment, update this checkpoint with the real status and exactly one next action, then stop. Keep live probes, publishing workflows, Docker publication and the deployed VM untouched.

## RELEASE GATE
Do not provide production deployment steps until all required phases above are complete, relevant CI/tests pass, and the resulting branch is explicitly identified as a release candidate.

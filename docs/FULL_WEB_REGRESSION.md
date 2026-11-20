# Full web regression assessment — 2026-09-29

## Scope and reproduction

Assessed commit `37cda1ea79573ebcdea3eb7b2ed7062e49be99fa` on `chore/work-checkpoint-system` in the isolated development checkout. Node v24.19.0, pnpm 9.15.0; installed dependencies and existing Vitest configuration were used unchanged. No application code or test expectations were modified.

From the repository root, with a writable output directory:

```bash
mkdir -p /tmp/bookkeeprr-regression
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run \
  --reporter=default --reporter=json \
  --outputFile=/tmp/bookkeeprr-regression/full.json \
  > /tmp/bookkeeprr-regression/full.log 2>&1
corepack pnpm@9.15.0 check:french
```

The recorded run wrote to `/workspace/scratch/28f1a8022399/regression-2026-09-29` instead of `/tmp/bookkeeprr-regression`. The French gate ran concurrently with the full suite, so durations are observational, not benchmarks. The full command selects the existing unit and integration projects, excluding browser E2E. Integration tests use temporary SQLite databases. This was not a VM or Docker execution.

## Results

Full suite: **3,981 passed, 13 failed, 3 skipped** (3,997 tests); **555 passed, 4 failed, 1 skipped** (560 files). Exit code 1; duration 308.92 s; Vitest 4.1.8. The machine-readable assessment in `full-web-regression-2026-09-29.json` preserves aggregate counts, non-passing files and all thirteen exact failed test names. JSON reporter suite counts include nested suites and are not file counts; the file totals above come from the console reporter. No unhandled-error section was reported.

The French gate passed web TypeScript and **405 tests across 30 files**, with zero failures (Vitest duration 18.95 s). No additional test cases were needed for this documentation-only assessment.

## Classification from directly relevant code and tests

### Existing integration isolation gaps: three timeouts

- `tests/integration/jobs/ebook-hydrate-ol-fallback.test.ts`: `skips OL-by-ISBN when description is already present` leaves Open Library `getWork` unmocked. After metadata processing, `ebook-hydrate.ts` calls `getWork(series.openlibraryId, 2)` for alias enrichment. That client path calls `fetchJson` without an explicit timeout. The assertion about avoiding ISBN lookup does not isolate this other provider operation.
- `tests/integration/jobs/googlebooks-hydrate.test.ts`: `always replaces an existing novel cover but never lowers totalVolumes` supplies three broad-search editions but retains five volumes, leaving gaps for the targeted `searchVolumeEdition` pass.
- The same file: `clears a stale placeholder cover on re-hydrate when no real cover is found` restores mocks and supplies catalog-only results; the targeted Google Books edition search again remains unmocked. Nearby tests explicitly mock that operation.

All three exceeded the unchanged 15-second integration timeout. The two test files, the two hydration job files and Google Books client are unchanged relative to baseline `7ad1ca98b81a270582baa78ab25ef3fb2b072971`. The Open Library client has added French edition functions, but its existing `getWork`/`fetchJson` implementation is unchanged. Classification: **pre-existing isolation gaps, environment-sensitive provider waits, outside the new French edition flow**. No baseline suite run was performed; unchanged-code comparison does not prove the baseline fails identically everywhere.

### Discover search isolation gap: nine timeouts

`tests/server/api/discover/search.test.ts` sets default mocks for several providers but none for BnF. Eight failing cases in its `contentType=all` and `contentType=comic` paths reach `searchFrenchComicSeries` through `searchBnfComics`/`searchComics` in `src/app/api/discover/search/route.ts`, regardless of a missing or disabled ComicVine key. The ninth failure, `returns manga results from AniList`, leaves MangaDex `searchMangaByTitle` unmocked; the route enriches manga results through that function. All nine failures exceeded the unchanged five-second unit-test timeout.

Both this test file and route are unchanged relative to the verified baseline, which already included BnF. BnF internals have since been hardened, including the bounded SRU deadline; no assertion failure establishes incorrect French results. Classification: **environment-sensitive blockers in general Discover search tests, with pre-existing missing BnF/MangaDex mocks**. It is not evidence that the French catalog is empty or that the new title/ISBN workflow regressed. A test-isolation fix and rerun are required before claiming these behaviors pass.

### French-related documentation inconsistency: one assertion failure

`tests/server/openapi/snapshot-freshness.test.ts` reports a deterministic mismatch between the generated specification and `apps/website/public/openapi.json`. The generated comic-create schema includes `bnfArk` and a positive optional `comicvineId`; the committed snapshot omits `bnfArk`, lacks the positive constraint and still requires `comicvineId`. The runtime schema is in `src/server/openapi/schemas/series.ts`. The snapshot, test and OpenAPI source files are unchanged since the verified baseline: this inconsistency was already present in the initial BnF integration, not introduced by this assessment. Classification: **French-flow API documentation regression already present at baseline**, not a demonstrated runtime add failure or an environment blocker. No baseline test execution is claimed.

## Limits and next step

The existing full suite is not fully hermetic: unmocked provider paths can attempt external requests. No separate live catalog probe was launched, and this run is not provider availability or coverage evidence. Timing failures do not distinguish network restrictions, provider latency or all possible concurrency effects. The focused French gate passing does not override a failed full-suite gate.

Synchronize the committed website OpenAPI snapshot with the existing runtime schema using the existing generator. Review the generated diff and run the snapshot-freshness test plus `check:french`; do not change runtime contracts or weaken the snapshot assertion. The twelve provider-related timeouts remain separate queued work (Discover BnF/MangaDex isolation and ebook/Google Books hydration isolation).

No remote CI success, browser review, Docker build/publication, release-candidate readiness or production deployment is claimed. Prior live coverage and illustrated-placeholder blockers remain open.

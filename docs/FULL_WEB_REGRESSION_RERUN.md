# Full web regression rerun — 2026-09-29

## Scope and reproduction

Assessed commit `ee348cb21693c089a4bb16e22d7ada0d5d24285d` on `chore/work-checkpoint-system`, with a clean checkout matching the fetched branch. Node v24.19.0, pnpm 9.15.0, existing installed dependencies and Vitest configuration. No production code, tests, dependencies or configuration changed during this assessment.

Commands from the repository root (use a fresh writable output directory):

```bash
mkdir -p /tmp/bookkeeprr-regression-rerun
corepack pnpm@9.15.0 --filter @bookkeeprr/web exec vitest run \
  --reporter=default --reporter=json \
  --outputFile=/tmp/bookkeeprr-regression-rerun/full.json \
  > /tmp/bookkeeprr-regression-rerun/full.log 2>&1
corepack pnpm@9.15.0 check:french
```

The recorded outputs used `/workspace/scratch/28f1a8022399/regression-rerun-2026-09-29`. Both commands ran concurrently; durations are observations, not performance benchmarks. The existing configuration selects web unit and integration tests, with browser E2E excluded. Temporary SQLite integration tests run in the development workspace.

## Results

Full suite: **3,994 passed, 0 failed, 3 skipped**, 3,997 tests total; **559 passed, 0 failed, 1 skipped** files, 560 total. Exit 0, Vitest 4.1.8, duration 103.99 s. No unhandled-error section was reported.

All thirteen exact failures from the original assessment are present and passed in this combined run. Counts and case-by-case resolution are recorded in `full-web-regression-rerun-2026-09-29.json`. The test total is unchanged: thirteen failures became thirteen passes.

The three unchanged skips belong to `tests/server/integrations/novelupdates/live.test.ts`, gated by `RUN_LIVE_TESTS=1`: canary title search, populated series detail and chapter feed. They were not enabled and are not passing live-coverage evidence.

French gate: web TypeScript PASS and **405 passed, 0 failed**, thirty files, 7.85 s, exit 0.

The original assessment (`FULL_WEB_REGRESSION.md` and `full-web-regression-2026-09-29.json`) remains unchanged as historical evidence. Subsequent fixes were limited to the generated OpenAPI snapshot (`64fbdf6`), Discover provider isolation (`3899ead`) and hydration provider isolation (`6775d36`). No valid assertions or test cases were removed and no timeout was increased.

## Limits

This run is not live provider coverage, browser validation, a Docker build, remote CI verification or deployment evidence. Existing BnF/DLP access and illustrated-placeholder limitations remain open, as do other unchecked checkpoint phases. No dedicated live probes or publishing workflows were launched; the deployed VM was not accessed. Passing tests alone do not identify a release candidate.

## Next bounded check

Verify the existing non-publishing French catalog GitHub Actions runs for the recorded code state (or a descendant containing it). Record exact run/commit IDs and outcomes, inspect relevant logs only if a run fails, and choose one subsequent action. Do not dispatch publishing workflows or infer remote CI success from this local run.

# Bounded live French bibliography check — 2026-09-28

## Outcome
Coverage remains **unverified / blocked from this workspace**. All three BnF title lookups timed out before an HTTP response was received. This is not an empty catalog result and does not establish a global BnF outage or the cause of the access failure.
No edition/ISBN was returned, so no exact-ISBN lookup was eligible. Open Library was not called: the existing strict fallback policy correctly propagates BnF failure rather than treating it as absence. No title-to-ISBN identity comparison could be made.

| Title | Start (UTC) | Lookup duration | Observed result | Exact ISBN |
| --- | --- | --- | --- | --- |
| Les Cinq Terres | 2026-09-28T12:40:52.150Z | 20013 ms | Timeout before HTTP response | Not run: no returned edition |
| Ekhö | 2026-09-28T12:41:12.168Z | 20002 ms | Timeout before HTTP response | Not run: no returned edition |
| Les Légendaires | 2026-09-28T12:41:32.173Z | 20002 ms | Timeout before HTTP response | Not run: no returned edition |

Three logical title lookups, three outbound BnF SRU GET attempts, zero received HTTP statuses/bodies, zero retries, zero Open Library requests, zero ISBN lookups. No cover request, library import, database access or VM operation.

## Reproducible capture and provenance
- Application source commit: `5a33c8112727a505344727a1b28605756ada917a` (includes verified code `ce46554`).
- Runtime: Node v24.19.0 in the development workspace; existing native fetch and provider functions, without injected catalog responses or substituted transports.
- Raw trace: [french-live-2026-09-28/report.json](french-live-2026-09-28/report.json). It contains exact requested SRU URLs/CQL, timestamps, timings and error names/messages. The native fetch error is `TimeoutError` (code 23), surfaced by the client as `BnfError: BnF SRU request failed: The operation was aborted due to timeout`.
- Capture script: `apps/web/scripts/check-french-live.ts`. Its fetch wrapper records the actual response metadata and any text consumed by the client; a received body would be saved with SHA-256. No response-body files exist because none was received. The script does not invent a response status or edition.
- One title lookup per named title, followed by at most one exact-ISBN lookup of the first returned validated edition. No ISBN is guessed or sourced elsewhere. Output directories must be new; the script refuses to overwrite an earlier capture.

Executed from `apps/web`:
```bash
node --import tsx scripts/check-french-live.ts ../../docs/french-live-2026-09-28
```
The first launch via the `tsx` CLI failed before script execution/network access: `listen EPERM` creating its temporary IPC socket. Running Node with the installed tsx import loader avoided that unnecessary CLI socket. This was not a provider retry.

For a future authorized capture **only after access conditions change**, use the same command with a new output directory. No automatic run or CI job invokes this script. Do not rerun the recorded failing probes simply to seek a different answer.

## Application limits retained
The existing BnF SRU lookup has a shared 20-second budget and a five-page cap; all attempts stopped during page one. Title fallback examines at most five Open Library documents/edition candidates within its own 15-second budget, but was not entered. Its exact-ISBN fallback is also unobserved here.
Even a successful result would be a bounded sample, not proof of complete series coverage or recent-release availability. The proposed edition comparison records EAN, source, source ID and title equality; all comparisons remain unavailable for this run.

The evidence cannot distinguish workspace/network routing limitations from a provider-side failure. No further transport probes, alternate providers, browser/catalog searches or metadata-policy changes were performed in this step.

## Regression verification
`corepack pnpm@9.15.0 check:french`: web TypeScript PASS; **405 passed, 0 failed**, thirty files. `git diff --check`: PASS.
The existing mocked-provider/temporary-SQLite/real-image suite verifies behavior, not live availability. No new test count, remote CI success, full-suite result, Docker build or release readiness is claimed.

## Follow-up
Keep live coverage unverified until new access or reproducible provider evidence is available. Continue the full offline web regression assessment as the next bounded checkpoint; do not repeat the completed implementations or these failed probes.

# French catalog remote CI verification — 2026-09-29

Assessed branch head: `b94905c173734efd056c6fdac63fe9e66975684d` on `chore/work-checkpoint-system`.
Observed at approximately 21:06 UTC through read-only GitHub Actions API calls.

## Verified result

| Item | Evidence |
| --- | --- |
| Workflow | French catalog, `.github/workflows/french-catalog.yml`, ID `366296501` |
| Run | [36552116857](https://github.com/mannixteam/bookkeeprr/actions/runs/36552116857), number 62, attempt 1 |
| Trigger | `pull_request`, PR #1 |
| Run head SHA | `b94905c173734efd056c6fdac63fe9e66975684d` |
| Run status / conclusion | completed / success |
| Created / updated | 2026-09-29T09:53:51Z / 2026-09-29T09:55:24Z |
| Job | `109352610355`, French catalog - typecheck and regressions |
| Job status / conclusion | completed / success |
| Relevant steps | Checkout, Install pnpm, Setup Node, Install dependencies, Check French catalog: all completed / success |

The commit-filtered run wrapper returns pull-request runs only. The individual run API independently confirmed the head SHA, event, workflow path and successful conclusion; the jobs API confirmed the job and step outcomes. A workflow-path collection URL was rejected by the connector allowlist; this does not invalidate the successful individual run/job reads. No push-run result is asserted.

## Commit and scope verification

`git merge-base --is-ancestor ee348cb21693c089a4bb16e22d7ada0d5d24285d HEAD` passed. The assessed head therefore contains the OpenAPI snapshot fix (`64fbdf6`), Discover isolation (`3899ead`) and hydration isolation (`6775d36`). The diff from `ee348cb` contains only the three regression-evidence/checkpoint documents; no application, test, dependency or workflow changes.

The checked workflow uses Ubuntu, Node 22, pnpm 9.15.0, frozen-lockfile installation and `pnpm check:french`. It has read-only contents permission, no persisted checkout credentials, and no publishing or deployment steps.

The observed remote gate passed. Logs were not downloaded because no relevant job failed, as required by NEXT ACTION. Consequently no independently counted remote test total or checked-out PR merge SHA is asserted: GitHub reports the associated PR head above; checkout uses the action's normal PR behavior. The previous local evidence remains 405 French tests plus TypeScript and 3,994 full-suite passes / 3 skips on `ee348cb`, not a new local run or a remote full-suite count.

Evidence consistency (run/job relationship, exact head, ancestry, successful gate step) and `git diff --check`: PASS. No local suite was repeated; no runtime behavior changed. Other workflow results returned by the discovery query were outside this assessment. No workflow was dispatched or rerun, no provider was probed, and no Docker/VM operation occurred.

## Remaining work

This verifies the existing French CI gate on a descendant containing all three fixes. It does not close browser validation, live recent-edition coverage, illustrated-placeholder recognition, other unchecked catalog phases or release preparation. Later documentation commits may trigger new runs; this assessment applies only to the exact run/head above.

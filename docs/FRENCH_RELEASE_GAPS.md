# French catalog release gaps — 2026-11-23

Assessment baseline: `23042fb8b042d817c117762d7f28eed9e51f63c5`, branch `chore/work-checkpoint-system`. Documentation-only synthesis of [WORK_CHECKPOINT.md](WORK_CHECKPOINT.md) and the reports linked below. **Not a release candidate.** No completed implementation investigation, test suite, provider probe or VM operation was repeated.

## Evidence already available

| Evidence | Exact scope and reference |
| --- | --- |
| French gate | `b3c3166cabc7f8a64bbf89ae697b14148b18724e`: TypeScript and 441 tests in 31 files passed; [run 45260147511](https://github.com/mannixteam/bookkeeprr/actions/runs/45260147511). Includes the real-client collection-only hydration regression. Recorded in the checkpoint; no fresh CI read or run was needed for this synthesis. |
| Full web suite | `ee348cb21693c089a4bb16e22d7ada0d5d24285d`: 3,994 passed, zero failed, three optional NovelUpdates live tests skipped. [Rerun report](FULL_WEB_REGRESSION_RERUN.md) and [counts](full-web-regression-rerun-2026-09-29.json). This predates subsequent French changes and is not a full-suite result for the present head. |
| Browser panels | `39631ddd64f4734b71a0df769e87b387e897339f`: four scenarios passed at desktop/tablet viewports, including mixed and partial results. [Browser report](FRENCH_BROWSER_VALIDATION.md). Mocked APIs; neither an authenticated full application nor a real import was exercised. |
| Live bibliography | [Coverage report](FRENCH_LIVE_COVERAGE.md), evidence commit `08c50b9660d1613c789e6575f655a0c171c648fe`: three BnF timeouts, no response bodies, no ISBN comparison. Blocked, not empty or successful coverage. |
| Illustrated placeholders | [Placeholder report](FRENCH_COVER_PLACEHOLDERS.md), evidence commit `19538e36c8c6ee05e6d59b7cf2acdd42102d7034`: no verified placeholder image or successful genuine-cover control. HTML and synthetic artwork cannot supply this evidence. |

Older reports retain their historical follow-ups. Later checkpoint entries supersede the statements that browser validation, title supplementation or the original thirteen suite failures remain unresolved. Those completed tasks must not be restarted.

## The five unchecked required phases

These are finite acceptance criteria proposed from the recorded limits, not new defect findings. All five required-phase boxes remain unchecked in this documentation step.

| ID / required phase | Current classification | Concrete missing acceptance evidence |
| --- | --- | --- |
| M — Remaining BnF metadata | Acceptance coverage gap; no additional reproduced unfixed metadata defect identified in the recorded evidence | A small, provenance-backed sample of genuine French BD/comic/manga notices with expected title, creator, publisher, date, language and selected ARK/EAN, compared with application results. Record exclusions and ambiguous fields explicitly. Reuse completed identifier, language, SRU and ordinal tests; add a regression only for a demonstrated mismatch. A synthetic fixture does not establish real catalog accuracy. |
| C — Recent-edition coverage | Blocked by missing successful live evidence | After documented changed access or new reproducible provider evidence, capture the already specified three-title sample and bounded title-to-ISBN comparisons. Include a verified recent French edition supplied by Open Library after a successful BnF lookup lacks that edition, plus a BnF-present control; establish publication/edition identity from retained source metadata. Record actual returned EAN/source/ID and omissions. Timeouts never establish BnF absence; the bounded sample never establishes exhaustive series coverage. Existing probes must not be repeated under unchanged conditions. |
| G — Remaining series / volume / edition grouping | Acceptance coverage gap plus conservative model limits | Use provenance-backed notices with known series/tome/edition relationships to compare catalog grouping and selected-ARK hydration. Include ordinary numbered albums, an unnumbered album, an integral and distinct ISBN editions; record whether metadata actually supports each relationship. Reuse completed creator/publisher, relation-conflict, collection, compilation and deduplication regressions. Document splits/ambiguities from sparse metadata rather than promising fuzzy reconciliation. Close only against a named sample and explicit supported scope. |
| P — Provider illustrated placeholders | Unimplemented recognition, blocked on verified response bytes | Obtain original BnF/DLP missing-cover image responses with source URL, status/MIME, capture time, checksum and evidence of missing-cover status; compare repeated responses and a genuine-cover control. Then implement narrowly scoped recognition and verify rejection, genuine-cover acceptance and edition-bound fallback. The recorded HTML error hash is forbidden as an image fingerprint. No sample currently satisfies this criterion. |
| R — Integration/regression and real-test candidate | Packaging/runtime evidence absent from the recorded assessment; final candidate not selected | Verify a production Docker image build and startup in a disposable development environment, with fresh temporary configuration/database and no production mounts. Record exact source SHA, build/runtime outcomes and teardown. Before declaring a candidate, resolve M/C/G/P, select an immutable revision, assess changes since the recorded full-suite run and run the applicable final gates on that revision. Reuse unchanged browser evidence; add authenticated-application/import evidence only for the integration gap, not another panel-layout investigation. Prepare isolated VM test/rollback instructions only when the release gate permits them. |

## Intentional limits versus unresolved work

- Confirmed French-only language, checksum-valid book identifiers and strict provider failure semantics intentionally reject uncertain metadata. Relaxing these rules is not an acceptance criterion.
- Provider pagination, candidate caps and deadlines bound coverage. A returned edition count is not a complete series total. Successful supplementation also remains bounded.
- Exact creator/publisher grouping can split changing teams; missing distinguishing metadata can leave works ambiguous. One library edition per ordinal, null ordinals for unnumbered albums/integrals and no inferred numbered rows are current model choices. A broader edition picker or fuzzy grouping is not silently added to this release scope.
- Exact-ISBN import creates an edition-only entry without automatic monitoring or accepted cover. Open Library metadata alone does not prove comic genre. These are documented choices, not newly discovered regressions.
- Image decoding proves a valid image, not semantic cover/edition identity. Illustrated-placeholder recognition is a separate unfinished requirement, not a limit to silently accept as completed.
- The original thirteen full-suite failures were resolved in the recorded combined rerun. Collection grouping, collection ordinals and collection-only hydration are also completed. This checklist reports no new failing test or newly reproduced application defect.

## One executable next step

**Validate the production Docker build and startup in a disposable development environment.** This addresses R without requiring unavailable bibliographic/placeholder samples. Inspect only the existing build/runtime instructions needed for that check; use an isolated local image tag, fresh temporary storage and a non-production port. Disable automatic provider/download activity, publish nothing, and never connect to the user's VM or mount production data. Record the exact revision, commands, build result, startup/health result and cleanup. If the development runner lacks Docker or build prerequisites, record the precise blocker without substituting production access or claiming success. Do not begin M/C/G/P or repeat their probes in that step.

This step does not waive the other four acceptance requirements and cannot by itself authorize deployment. It was selected here, not executed.

## Verification of this checklist

Checked all five unchecked required phases against the checkpoint, report counts and limitations against the cited local documents, and cited commit existence/ancestry against the fetched branch. The initial ancestry check could not find an older object in the shallow checkout; fetching the missing history resolved that prerequisite, and all six cited commits passed. Relative document links exist. Git whitespace validation passed. No application tests were run: this is evidence consolidation only, as required by the current NEXT ACTION. The existing results above remain attributed to their original revisions.

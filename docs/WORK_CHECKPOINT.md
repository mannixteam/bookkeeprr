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
- [ ] Audit and harden BnF metadata + ISBN/EAN normalization.
- [ ] Add reliable complementary metadata for recent French editions absent from BnF.
- [ ] Harden series / volume / edition grouping.
- [ ] Harden edition deduplication.
- [ ] Implement multi-source French cover selection with real image validation.
- [ ] Expand French BD/comics/manga automated tests and CI coverage.
- [ ] Run full integration/regression pass and prepare a release candidate for real VM testing.

## STATUS
Checkpoint framework initialized. The baseline branch exists and currently points to the commit above. Detailed functional status beyond the already committed BnF support must be established from the code/tests rather than inferred from earlier chat history.

## DO NOT REDO
- Do not recreate the initial BnF integration from scratch.
- Do not alter the user's deployed production instance.
- Do not perform broad repository re-analysis when the next action can be answered from the files/tests directly relevant to it.
- Do not repeat a completed investigation unless a new failing test or code change invalidates it.

## SESSION DISCIPLINE
Each session should solve one bounded problem, run relevant tests, commit a verified checkpoint, update this file, set one next action, and stop. Prefer targeted file/code searches over rereading the whole repository.

## NEXT ACTION
Audit the existing BnF implementation and its directly related tests for ISBN-10/ISBN-13/EAN normalization and edition identity. Add focused tests for uncovered cases, implement only the fixes those tests demonstrate are needed, commit the verified result, then update this checkpoint and stop.

## RELEASE GATE
Do not provide production deployment steps until all required phases above are complete, relevant CI/tests pass, and the resulting branch is explicitly identified as a release candidate.

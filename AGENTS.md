# Bookkeeprr French Comics Development

## Objective
Improve Bookkeeprr support for French BD, comics and manga while preserving upstream compatibility and the currently deployed production instance.

## Source and metadata priorities
1. Prefer BnF for French bibliographic metadata when it has the edition.
2. Support reliable complementary sources for recent French editions absent from BnF.
3. Normalize ISBN-10, ISBN-13 and EAN before matching or deduplication.
4. Preserve edition distinctions; never merge editions solely because titles are similar.
5. Group series and volumes using explicit metadata first and conservative heuristics second.
6. Prefer genuine French-edition covers and validate candidate image responses before accepting them.

## Development rules
- Never modify or deploy the production instance automatically.
- Work only on development branches.
- Start every Work/Codex task by reading this file and `docs/WORK_CHECKPOINT.md`.
- Continue from `NEXT ACTION`; do not re-investigate items marked DONE or DO NOT REDO unless a new failure proves that necessary.
- Keep tasks small: one functional problem per work session whenever practical.
- Every behavior change needs relevant automated tests.
- Do not disable, weaken, or delete valid failing tests merely to make CI green.
- Keep changes scoped; avoid unrelated refactors.
- Commit every verified checkpoint before starting the next substantial phase.
- Update `docs/WORK_CHECKPOINT.md` at the end of every work session, including incomplete sessions when possible.

## End-of-task procedure
1. Run the tests relevant to the changed code.
2. Record exact passing and failing tests.
3. Commit verified changes.
4. Update `docs/WORK_CHECKPOINT.md`.
5. Set exactly one concrete `NEXT ACTION`.
6. Stop rather than beginning another large phase.

## Production safety
The user's deployed Debian Docker instance must remain untouched until a release candidate is explicitly ready for real-world testing and the user asks for deployment instructions.

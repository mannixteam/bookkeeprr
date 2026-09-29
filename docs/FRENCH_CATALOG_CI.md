# French catalog regression gate

From the repository root, after installing the frozen lockfile:

```bash
corepack pnpm@9.15.0 install --frozen-lockfile
corepack pnpm@9.15.0 check:french
```

`check:french` explicitly uses Corepack/pnpm 9.15.0 for both child commands,
so a different global pnpm cannot be invoked accidentally. It runs the web
TypeScript check, then `@bookkeeprr/web`'s
`test:french` script. A failure in either command fails the gate. For a focused
rerun without TypeScript:

```bash
corepack pnpm@9.15.0 --filter @bookkeeprr/web test:french
```

The test selection lives in `apps/web/package.json`, not in a duplicated workflow
command. It covers BnF language/ISBN/SRU/grouping/edition handling, Open Library
fallback, Discover and edition import, metadata hydration, and validated cover
selection/cache/fallback. Provider calls are mocked; image decoding and temporary
SQLite databases are real. New tests in the selected directories are included
automatically; add new standalone French test files to `test:french`.

`.github/workflows/french-catalog.yml` uses the existing CI conventions: Node 22,
pnpm 9.15.0, Ubuntu and a frozen lockfile. It runs on pushes to
`chore/work-checkpoint-system`, all pull requests (including changes to shared
code/dependencies), and manual dispatch. There are no path filters that could
skip a relevant shared dependency change. Concurrent obsolete runs are cancelled.

This workflow has read-only repository permissions and runs no Docker builds,
image publication or deployments. Do not dispatch `ci.yml` merely to run these
tests: its existing manual-dispatch path also publishes container images.

The workflow supplies the status **French catalog - typecheck and regressions**.
Making that status mandatory for merges is a repository branch-protection setting;
this change does not configure repository protection rules. This focused gate is
not the full regression suite, a live catalog coverage check or a release approval.
The authoritative remaining work and observed CI results are in `WORK_CHECKPOINT.md`.

# French Discover browser validation — 2026-09-29

Status: **BLOCKED before browser execution**, not a passing browser assessment.
Assessed commit: `752f7bb75a574fca9bb07e7851f6101dfa5a64fe` on `chore/work-checkpoint-system`; clean initial Git state and identical fetched head.

## Setup evidence

The installed repository dependency is Playwright 1.60.0. A headless Chromium launch failed because `/root/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell` did not exist. No `chromium`, `chromium-browser` or `google-chrome` executable was found on PATH or at the checked standard locations.

From `apps/web`, `corepack pnpm@9.15.0 exec playwright install chromium` attempted Chrome for Testing 148.0.7778.96 / revision 1223 from `https://cdn.playwright.dev/builds/cft/148.0.7778.96/linux64/chrome-linux64.zip`. The installer performed its own retries and exited 1: `End of central directory record signature not found. Either not a zip file, or file is truncated.` No usable browser was installed. A separate minimal attempt, `timeout 40s node node_modules/@playwright/test/cli.js install chromium --only-shell`, exited 124 at the imposed deadline. Both processes finished.

These observations establish a local browser provisioning blocker, not a product regression or a claim that every remote browser environment is unavailable. No alternate download transport or live catalog probe was attempted. The existing general E2E configuration targets localhost:13000 and its setup requires a healthy application; the Docker E2E launcher was not started. No isolated application server was started after the browser prerequisite failed.

## Planned scenarios — all NOT RUN in a browser

Target desktop 1440×900 and tablet portrait 768×1024; these are proposed viewports, not observed device results.

- Open the French title panel and submit using keyboard navigation.
- Display deterministic edition fixtures, then select an ISBN without any automatic POST.
- Return a fresh ISBN identity different from the title candidate, select a quality profile and explicitly add; verify the submitted fresh identity/profile.
- After an earlier successful verification, return a retryable lookup error; assert old add controls disappear, then retry successfully.
- Inspect wrapping, overflow, visible focus and access to controls at both viewports.

Reuse the Mirage / ISBN 9780306406157 fixtures and composed flow in `tests/components/french-title.test.tsx`. API responses must be mocked and unmatched API/provider traffic blocked; no production data or VM access is needed. No screenshots, browser assertions or visual approval are claimed.

## Executed relevant checks

From `apps/web`:
```bash
node node_modules/vitest/vitest.mjs run tests/components/french-title.test.tsx tests/components/french-isbn.test.tsx tests/components/discover-empty.test.tsx
```
Result: **32 passed, 0 failed, 3 files**, exit 0, 1.96 s, Vitest 4.1.8. This executes the existing component regressions with mocked HTTP in jsdom; it is not a browser/layout test. No tests were added, changed, disabled or weakened. No runtime code, dependency, lockfile or CI configuration changed. `git diff --check`: PASS.

The earlier full-suite and remote French CI evidence remains valid for its recorded commits; neither was repeated. Browser validation remains open alongside the other release limitations. No deployment, Docker operation or VM access occurred.

# Changelog

## v1.1.1 - 2026-07-05

### Fixed

- The published OpenAPI spec now reports the correct release version; the release process regenerates it alongside each version bump, so image builds no longer fail their spec-freshness check
- GitHub CI no longer runs duplicate workflows for every release (the push-triggered runs merely repeated the release-triggered ones)

### Changed

- Test-suite reliability overhaul: the web end-to-end suite was restored to fully running order (it had been silently skipped by CI since the monorepo restructure) and its fixtures brought up to date; mobile test runs are now robust on cold CI runners; iOS device-test jobs gained watchdogs so a wedged simulator driver retries instead of hanging

## v1.1.0 - 2026-07-04

### Added

- Deleting a series can now also remove its files from disk: the delete dialog has an "also delete files" checkbox (on by default), and the API supports `deleteFiles=true`, which removes disk files and any associated qBittorrent torrents
- Readarr-compatible author deletion honors `deleteFiles=true`
- Audiobook reader now extracts embedded m4b chapters (QuickTime chapter tracks and Nero chpl)
- Import screen shows the full folder path as a tooltip on truncated paths
- Audit log viewer shows the request IP as metadata
- Website: new privacy policy page, linked from the footer
- Website: the Google Play badge links to the Play Store listing

### Changed

- Website now shows the latest release version automatically, refreshed hourly

### Fixed

- The app now reports the actual release version in Settings and the version pill (previously always 1.0.0)
- Audiobooks resume playback at the saved position instead of restarting from the beginning
- Audiobook search and library scan matching now use iTunes instead of the broken Audnex title search
- Import matching improvements: untracked files match against existing library series (with duplicate scan rows removed), multi-segment folder names rank correctly, no junk "best match" is suggested when nothing title-matches, and volume-suffix stripping no longer fires inside tokens like [EC-3]
- Import UI: the match dropdown stays within the viewport, search is scoped to the content type, and the "Apply to checked" bar stays pinned to the bottom of the screen
- Library scan is content-type-aware, links volumes reliably, and scan group summaries show the proposal title for all content types
- Title settings show the actual series folder
- Series deletion errors now surface details in the toast
- Mobile: account routes (2FA, sessions, notification preferences) accept bearer tokens, fixing unexpected sign-outs
- Mobile: PDFs render correctly on Android and show the real page count
- Mobile: the reader covers the tablet sidebar on Android
- Mobile: the What's-new sheet renders in a native modal, plus assorted settings and downloads UX fixes and forced update checks

## v1.0.3 - 2026-06-28

This release contains only internal CI/build changes with no user-facing impact.

_No user-facing changes in this release; it contains internal build and release-pipeline maintenance only._

## v1.0.2 - 2026-06-28

### Added
- Multi-architecture container images: the web app image now runs natively on both `amd64` and `arm64` hosts.

## v1.0.1 - 2026-06-28

### Changed
- Release tooling: `--init`/`--clean-runs` now also purges GHCR packages.

### Fixed
- Publishing the public mirror now authenticates GitHub pushes correctly (the source repo's SSH command is propagated to the mirror clone).

## v1.0.0 - 2026-06-28

### Added

- Initial public release.

# Changelog

All notable changes to doi-mcp. Every change to `main` is a release, written by `npm run ship`
([Semantic Versioning](https://semver.org/), [Conventional Commits](https://www.conventionalcommits.org/)).

## [5.0.2] - 2026-10-27

- **fix(release):** refuse inline --body when npm runs ship on Windows

On Windows, npm runs scripts through cmd.exe, which cuts an inline `--body` off at the first newline and silently drops every flag after it. A `--dry-run` was lost that way and 5.0.1 was published for real under the title "fix: probe". `ship` now refuses `--body` when npm runs it on Windows; pass the notes with `--body-file` instead.

The 5.0.0 and 5.0.1 changelog entries are corrected. The server is unchanged.

## [5.0.1] - 2026-10-27

- **fix(release):** write the full release notes into the changelog and add `--body-file`

Published by mistake under the title "fix: probe" (see 5.0.2). The server and `dist/` are unchanged from 5.0.0.

## [5.0.0] - 2026-10-27

- **feat!:** only verify and return papers that have a DOI

BREAKING CHANGE: every tool drops results without a DOI. A citation only verifies against a DOI-backed paper, and every verified result includes a `doiUrl`.

## [4.0.0] - 2026-07-30

- **feat!:** modular architecture (`src/tools/`, `src/databases/`), 9 databases, Vitest suite

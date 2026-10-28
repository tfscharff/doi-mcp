# Changelog

All notable changes to doi-mcp. Every change to `main` is a release, written by `npm run ship`
([Semantic Versioning](https://semver.org/), [Conventional Commits](https://www.conventionalcommits.org/)).

## [6.0.0] - 2026-10-28

- **feat!:** report database failures and fix broken adapters

BREAKING CHANGE: `findVerifiedPapers` with no results now returns JSON (`count`, `message`, `sourcesQueried`, `errors`) instead of a plain-text sentence, and is flagged `isError` when every database queried failed. Unverified `verifyCitation` and `batchVerifyCitations` results now include `errors`.

Database failures are no longer swallowed. Before, a rate limit or outage came back as "No verified papers found", which reads as "no such paper". Responses now name each failed database and say why.

Each database is now asked for 3× `limit` results, then trimmed back to `limit` after dropping records without a DOI, so DOI-less top hits no longer empty a source.

Adapters fixed after live testing (single-source, limit 2):
- HAL: asked for no fields, so no record had a DOI. Now requests fields and only DOI-bearing records.
- ERIC: has no DOI field. DOIs are now read from doi.org links in `url`, and the search is limited to such records.
- zbMATH: the old endpoint returned HTTP 400. Moved to the zbMATH Open v1 search API.
- INSPIRE-HEP: sorted by most recent, which surfaced preprints without DOIs. Now sorted by relevance.
- Semantic Scholar: the shared anonymous quota answers HTTP 429. Set `SEMANTIC_SCHOLAR_API_KEY` for a dedicated quota; a 429 is reported as `RATE_LIMITED` with that hint.
- DBLP: dblp.org now serves a bot-check page instead of JSON. This is reported as an explanatory error; the server does not try to get around it.

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

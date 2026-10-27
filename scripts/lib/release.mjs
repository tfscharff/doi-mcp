// Pure helpers for scripts/ship.mjs: Conventional Commit parsing, SemVer bumps, changelog edits.

const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert'];
const HEADER = new RegExp(`^(${TYPES.join('|')})(?:\\(([a-z0-9-]+)\\))?(!)?: (\\S.*)$`);

export function parseHeader(header) {
  const m = HEADER.exec(header.trim());
  if (!m) {
    throw new Error(
      `"${header}" is not a Conventional Commit header. Use "type(scope): description" with type one of: ${TYPES.join(', ')}.`,
    );
  }
  return { type: m[1], scope: m[2] ?? null, breaking: Boolean(m[3]), description: m[4] };
}

export function bumpFor(parsed, body = '') {
  if (parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';
  if (parsed.type === 'feat') return 'minor';
  return 'patch';
}

export function nextVersion(current, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!m) throw new Error(`Cannot bump version "${current}"`);
  let [major, minor, patch] = m.slice(1).map(Number);
  // Before 1.0.0, breaking changes bump the minor version (SemVer item 4).
  if (bump === 'major' && major === 0) bump = 'minor';
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function changelogEntry(version, date, parsed) {
  const label = parsed.scope ? `${parsed.type}(${parsed.scope})` : parsed.type;
  const bang = parsed.breaking ? '!' : '';
  return `## [${version}] - ${date}\n\n- **${label}${bang}:** ${parsed.description}\n`;
}

export function insertChangelog(changelog, entry) {
  const idx = changelog.search(/^## \[/m);
  if (idx === -1) return `${changelog.trimEnd()}\n\n${entry}`;
  return `${changelog.slice(0, idx)}${entry}\n${changelog.slice(idx)}`;
}

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  assertSafeArgs,
  parseHeader,
  bumpFor,
  nextVersion,
  changelogEntry,
  insertChangelog,
  releaseNotes,
} from '../../scripts/lib/release.mjs';

describe('release helpers', () => {
  it('parseArgs reads the header and options', () => {
    expect(parseArgs(['fix: x', '--body-file', 'notes.md', '--as', '5.0.1', '--dry-run'])).toEqual({
      header: 'fix: x', body: '', bodyFile: 'notes.md', as: '5.0.1', dryRun: true,
    });
    expect(parseArgs(['feat: y', '--body', 'inline'])).toMatchObject({ header: 'feat: y', body: 'inline', bodyFile: null });
  });

  it('assertSafeArgs refuses inline --body when npm runs on Windows', () => {
    // Regression: cmd.exe cut --body at a newline, dropped --dry-run, and a real release went out
    const inline = parseArgs(['fix: x', '--body', 'Line one.']);
    expect(() => assertSafeArgs(inline, { platform: 'win32', viaNpm: true })).toThrow(/--body-file/);
    expect(() => assertSafeArgs(inline, { platform: 'win32', viaNpm: false })).not.toThrow();
    expect(() => assertSafeArgs(inline, { platform: 'linux', viaNpm: true })).not.toThrow();
    expect(() => assertSafeArgs(parseArgs(['fix: x', '--body-file', 'n.md']), { platform: 'win32', viaNpm: true })).not.toThrow();
  });

  it('parseArgs rejects a missing header, extra arguments, and both body options', () => {
    expect(() => parseArgs(['--dry-run'])).toThrow(/Usage/);
    expect(() => parseArgs(['fix: x', 'stray'])).toThrow(/Unexpected argument: stray/);
    expect(() => parseArgs(['fix: x', '--body', 'a', '--body-file', 'b'])).toThrow(/not both/);
  });

  it('parseHeader reads type, scope, breaking flag and description', () => {
    expect(parseHeader('feat(scoring): add author weighting')).toEqual({
      type: 'feat', scope: 'scoring', breaking: false, description: 'add author weighting',
    });
    expect(parseHeader('fix!: drop DOI-less results')).toEqual({
      type: 'fix', scope: null, breaking: true, description: 'drop DOI-less results',
    });
  });

  it('parseHeader rejects headers that are not conventional commits', () => {
    expect(() => parseHeader('Added voting')).toThrow(/Conventional Commit/);
    expect(() => parseHeader('feature: add voting')).toThrow(/Conventional Commit/);
    expect(() => parseHeader('feat: ')).toThrow(/Conventional Commit/);
  });

  it('bumpFor maps commit types to SemVer bumps', () => {
    expect(bumpFor(parseHeader('feat: x'))).toBe('minor');
    expect(bumpFor(parseHeader('fix: x'))).toBe('patch');
    expect(bumpFor(parseHeader('docs: x'))).toBe('patch');
    expect(bumpFor(parseHeader('chore: x'))).toBe('patch');
    expect(bumpFor(parseHeader('feat!: x'))).toBe('major');
    expect(bumpFor(parseHeader('fix: x'), 'BREAKING CHANGE: removed y')).toBe('major');
  });

  it('nextVersion applies bumps, treating breaking changes as minor before 1.0.0', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(nextVersion('0.1.3', 'minor')).toBe('0.2.0');
    expect(nextVersion('0.4.2', 'major')).toBe('0.5.0');
    expect(nextVersion('4.0.0', 'major')).toBe('5.0.0');
    expect(nextVersion('5.0.0', 'minor')).toBe('5.1.0');
    expect(() => nextVersion('1.2', 'patch')).toThrow(/version/);
  });

  it('changelogEntry formats a dated entry with the commit description', () => {
    expect(changelogEntry('5.0.0', '2026-10-27', parseHeader('feat!: only verify papers with a DOI'))).toBe(
      '## [5.0.0] - 2026-10-27\n\n- **feat!:** only verify papers with a DOI\n',
    );
    expect(changelogEntry('5.0.1', '2026-10-28', parseHeader('fix(pubmed): parse DOIs'))).toBe(
      '## [5.0.1] - 2026-10-28\n\n- **fix(pubmed):** parse DOIs\n',
    );
  });

  it('changelogEntry appends the body as release notes, without Co-Authored-By trailers', () => {
    const body = 'BREAKING CHANGE: results without a DOI are dropped.\n\nFixes:\n- one\n\nCo-Authored-By: Someone <x@example.com>\n';
    expect(changelogEntry('5.0.0', '2026-10-27', parseHeader('feat!: only DOIs'), body)).toBe(
      '## [5.0.0] - 2026-10-27\n\n- **feat!:** only DOIs\n\nBREAKING CHANGE: results without a DOI are dropped.\n\nFixes:\n- one\n',
    );
  });

  it('changelogEntry ignores a body that is only trailers or whitespace', () => {
    expect(changelogEntry('5.0.1', '2026-10-28', parseHeader('fix: x'), '\nCo-Authored-By: A <a@b.c>\n  ')).toBe(
      '## [5.0.1] - 2026-10-28\n\n- **fix:** x\n',
    );
  });

  it('releaseNotes is the entry without its version heading', () => {
    const entry = '## [5.0.0] - 2026-10-27\n\n- **feat!:** only DOIs\n\nDetails here.\n';
    expect(releaseNotes(entry)).toBe('- **feat!:** only DOIs\n\nDetails here.');
  });

  it('insertChangelog puts the newest entry directly under the intro', () => {
    const before = '# Changelog\n\nIntro text.\n\n## [0.1.0] - 2026-10-01\n\n- **chore:** start\n';
    const entry = '## [0.1.1] - 2026-10-02\n\n- **fix:** typo\n';
    expect(insertChangelog(before, entry)).toBe(
      '# Changelog\n\nIntro text.\n\n## [0.1.1] - 2026-10-02\n\n- **fix:** typo\n\n## [0.1.0] - 2026-10-01\n\n- **chore:** start\n',
    );
    expect(insertChangelog('# Changelog\n\nIntro text.\n', entry)).toBe(
      '# Changelog\n\nIntro text.\n\n## [0.1.1] - 2026-10-02\n\n- **fix:** typo\n',
    );
  });
});

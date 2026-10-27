#!/usr/bin/env node
// Test, rebuild dist/, commit everything, bump the SemVer version, tag, push and publish a GitHub
// release, in one step. dist/ is committed (npx installs straight from GitHub), so it is rebuilt here.
//
// Usage: npm run ship -- "<type>(<scope>)!: <description>" [--body "<text>" | --body-file <path>]
//          [--as X.Y.Z] [--dry-run]
//   feat -> minor, fix/docs/chore/etc. -> patch, "!" or "BREAKING CHANGE:" in body -> major
//   (before 1.0.0 a breaking change bumps minor). --as forces an exact version.
//   The body becomes the CHANGELOG entry's notes and the GitHub release notes. On Windows, npm runs
//   scripts through cmd.exe, which cuts --body off at the first newline: use --body-file there.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs, parseHeader, bumpFor, nextVersion, changelogEntry, insertChangelog, releaseNotes } from './lib/release.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe', shell: process.platform === 'win32' && cmd === 'npm' });

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.bodyFile) args.body = readFileSync(args.bodyFile, 'utf8');
  const parsed = parseHeader(args.header);

  const branch = run('git', ['symbolic-ref', '--short', 'HEAD']).trim();
  if (branch !== 'main') throw new Error(`Releases are cut from main; you are on ${branch}.`);
  if (!run('git', ['status', '--porcelain']).trim()) throw new Error('Nothing to commit.');

  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = args.as ?? nextVersion(pkg.version, bumpFor(parsed, args.body));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Bad version: ${version}`);
  const tag = `v${version}`;
  if (run('git', ['tag', '--list', tag]).trim()) throw new Error(`Tag ${tag} already exists.`);

  const date = new Date().toISOString().slice(0, 10);
  const entry = changelogEntry(version, date, parsed, args.body);
  console.log(`${pkg.version} -> ${version} (${tag})\n\n${entry}`);
  if (args.dryRun) return console.log('Dry run: nothing changed.');

  console.log('Running tests...');
  run('npm', ['test'], { inherit: true });
  console.log('Building dist/...');
  run('npm', ['run', 'build'], { inherit: true });

  pkg.version = version;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  const lockPath = join(root, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  const clPath = join(root, 'CHANGELOG.md');
  writeFileSync(clPath, insertChangelog(readFileSync(clPath, 'utf8'), entry));

  run('git', ['add', '-A']);
  const msg = ['-m', args.header];
  if (args.body) msg.push('-m', args.body);
  run('git', ['commit', ...msg], { inherit: true });
  run('git', ['tag', '-a', tag, '-m', `${tag}: ${parsed.description}`]);

  const hasUpstream = (() => { try { run('git', ['rev-parse', '@{u}']); return true; } catch { return false; } })();
  run('git', hasUpstream ? ['push', '--follow-tags'] : ['push', '-u', 'origin', 'main', '--follow-tags'], { inherit: true });

  run('gh', ['release', 'create', tag, '--title', tag, '--notes', releaseNotes(entry), '--verify-tag'], { inherit: true });
  console.log(`Released ${tag}.`);
}

try {
  main();
} catch (err) {
  console.error(`ship: ${err.message}`);
  process.exit(1);
}

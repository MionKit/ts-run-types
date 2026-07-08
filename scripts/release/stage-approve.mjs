// stage-approve.mjs — guided, leaves-first approval of a staged @ts-runtypes/*
// release. After publish.yml stages every package via `npm stage publish` (no
// 2FA), a maintainer promotes them to live with a real 2FA challenge.
//
// npm stage approve/reject take a SINGLE <stage-id> — there is no atomic/group
// approval, and approving one publishes THAT package to the registry immediately.
// So order matters: approve leaves-first — every @ts-runtypes/binary-<os>-<arch>
// FIRST, then @ts-runtypes/bin (the launcher), then @ts-runtypes/core +
// @ts-runtypes/devtools — the SAME rank publish-tarballs.mjs stages in, so a
// consumer install never resolves a launcher whose platform binary 404s.
//
// This reads the pending stage-ids for THIS repo's version (version.json) from
// `npm stage list --json`, sorts them leaves-first, and runs `npm stage approve
// <id>` per package (npm prompts for the 2FA OTP each time). If the queue can't
// be read automatically it prints the exact leaves-first order to approve by hand.
//
// Flags:
//   --dry-run   print the approval plan; do not approve anything.

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {capture, die, note, noteErr, reportCliError, run, success, warn} from '../lib/proc.mjs';

// Staged publishing needs npm >= 11.15.0 (Trusted Publishing/OIDC needs >= 11.5.1).
const MIN_NPM = [11, 15, 0];

function cmpVersion(a, b) {
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function ensureNpmSupportsStage() {
  const version = capture('npm', ['--version']).stdout.trim();
  const parts = version.split('.').map((n) => parseInt(n, 10));
  const ok = parts.length >= 3 && !parts.some(Number.isNaN) && cmpVersion(parts, MIN_NPM) >= 0;
  if (!ok) die(`stage-approve: needs npm >= ${MIN_NPM.join('.')} for staged publishing (found ${version || 'unknown'}). Run: npm i -g npm@latest`);
}

function readVersion() {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8'));
  if (!manifest.version || manifest.version === 'independent') die('stage-approve: version.json has no fixed lockstep version.');
  return manifest.version;
}

// Lower rank approves (and so publishes) earlier: binary leaves, then the
// launcher, then the FE packages. Mirrors publish-tarballs.mjs's rank().
function rank(name) {
  if (name.startsWith('@ts-runtypes/binary-')) return 0;
  if (name === '@ts-runtypes/bin') return 1;
  return 2; // @ts-runtypes/core, @ts-runtypes/devtools
}

// Coerce whatever `npm stage list --json` returns into a flat [{name, version, id}].
// The exact JSON shape isn't contractually documented for this new command, so
// accept the plausible ones: a top-level array, an object with an array field
// (staged/packages/versions/results/stages), or an object keyed by package name
// whose values are arrays of version entries (the `npm outdated --json` shape).
function normalizeEntries(parsed) {
  const out = [];
  const pushEntry = (raw, fallbackName) => {
    if (!raw || typeof raw !== 'object') return;
    const id = raw.id ?? raw.stageId ?? raw['stage-id'] ?? raw.stage_id ?? raw.stageid;
    let name = raw.name ?? raw.package ?? fallbackName;
    let version = raw.version;
    const spec = raw.spec ?? raw.pkgid ?? raw._id;
    if ((!name || !version) && typeof spec === 'string') {
      const at = spec.lastIndexOf('@');
      if (at > 0) {
        name = name ?? spec.slice(0, at);
        version = version ?? spec.slice(at + 1);
      }
    }
    out.push({name, version, id});
  };
  if (Array.isArray(parsed)) {
    for (const entry of parsed) pushEntry(entry);
  } else if (parsed && typeof parsed === 'object') {
    const arrayField = parsed.staged ?? parsed.packages ?? parsed.versions ?? parsed.results ?? parsed.stages;
    if (Array.isArray(arrayField)) {
      for (const entry of arrayField) pushEntry(entry);
    } else {
      for (const [name, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) for (const entry of value) pushEntry(entry, name);
        else pushEntry(value, name);
      }
    }
  }
  return out;
}

// Print the leaves-first rule + the by-hand commands, then fail — used whenever
// the queue can't be read/parsed automatically.
function manualFallback(version, why) {
  noteErr(`stage-approve: ${why}`);
  console.log('');
  console.log('Approve by hand instead — LEAVES-FIRST (every @ts-runtypes/binary-* first, then');
  console.log('@ts-runtypes/bin, then @ts-runtypes/core + @ts-runtypes/devtools). Approving one');
  console.log('publishes it immediately, so order matters:');
  console.log('');
  console.log('  npm stage list                # find the stage-id for each package');
  console.log('  npm stage approve <stage-id>  # 2FA per id, in the order above');
  console.log('');
  console.log(`All packages are @ ${version}. Full runbook: SETUP.md → Publishing.`);
  die('', 1);
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  ensureNpmSupportsStage();
  const version = readVersion();
  note(`stage-approve for @ts-runtypes/* @ ${version}`);

  const listed = capture('npm', ['stage', 'list', '--json']);
  if (listed.status !== 0) return manualFallback(version, `\`npm stage list\` exited with code ${listed.status ?? '?'} (npm login? staged anything yet?).\n${listed.stderr.trim()}`);

  let parsed;
  try {
    parsed = JSON.parse(listed.stdout);
  } catch {
    return manualFallback(version, 'could not parse `npm stage list --json` output.');
  }

  const all = normalizeEntries(parsed);
  const incomplete = all.filter((entry) => !entry.id || !entry.name);
  if (incomplete.length) return manualFallback(version, `couldn't read a stage-id + name for ${incomplete.length} of ${all.length} staged entries.`);

  const forVersion = all.filter((entry) => !entry.version || entry.version === version);
  if (forVersion.length === 0) {
    note(`no pending staged packages for ${version} — nothing to approve (already promoted, or none staged).`);
    return;
  }
  const versionless = forVersion.filter((entry) => !entry.version).length;
  if (versionless) warn(`${versionless} staged entr${versionless === 1 ? 'y' : 'ies'} had no version field — approving them too, assuming they belong to ${version}.`);

  const ordered = forVersion.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  console.log('\nApproval order (leaves-first — approving publishes THAT package to npm immediately):');
  for (const entry of ordered) console.log(`  ${entry.name}@${entry.version ?? version}  (${entry.id})`);
  console.log('');

  if (dryRun) return void note('--dry-run: not approving. Re-run without --dry-run (npm prompts for your 2FA OTP per package).');

  for (const entry of ordered) {
    note(`approving ${entry.name} (${entry.id}) — npm will prompt for your 2FA OTP`);
    const code = run('npm', ['stage', 'approve', entry.id]);
    if (code !== 0) {
      die(
        `stage-approve: 'npm stage approve ${entry.id}' failed for ${entry.name} (code ${code}).\n` +
          'The packages listed BEFORE it are already live. Fix the issue and re-run — already-approved\n' +
          'packages drop off the queue, so it resumes where it stopped.',
        code
      );
    }
    success(`${entry.name} approved -> live`);
  }
  console.log('');
  success(`Approved ${ordered.length} package(s) for ${version}. Now deploy the docs: Actions -> website-deploy.yml -> Run workflow.`);
}

loadEnv();
try {
  main(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}

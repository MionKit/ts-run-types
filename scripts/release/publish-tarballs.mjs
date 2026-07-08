#!/usr/bin/env node
// Publishes the packed tarballs/ in dependency-safe order: every
// @ts-runtypes/binary-<os>-<arch> FIRST, then @ts-runtypes/bin (the launcher),
// then the FE packages — so the launcher never lands referencing optional deps
// that aren't on the registry yet.
//
// TWO paths, selected by --registry:
//   • no --registry (CI / release): the PUBLIC registry via `npm stage publish`.
//     Staged publishing uploads to a stage queue and needs NO 2FA, so CI can stage
//     unattended; a maintainer then promotes each staged version to live with a
//     real 2FA challenge (`pnpm rtx release stage-approve`, or the npmjs.com queue).
//     Auth is npm Trusted Publishing (OIDC) — the publish-npm job grants
//     id-token:write, so there is NO NPM_TOKEN and provenance is attached
//     automatically. See SETUP.md → Publishing.
//   • --registry <url> (local verdaccio e2e): a plain `npm publish` into the
//     throwaway registry — never staged (staging is a registry.npmjs.org feature).
//     The caller sets that registry's auth; this script does not touch it.
//
// Flags:
//   --registry <url>  plain-publish to a specific registry (e.g. local verdaccio).
//   --provenance      attach npm provenance (public/OIDC path only).

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');

const args = process.argv.slice(2);
const registryIdx = args.indexOf('--registry');
const registry = registryIdx !== -1 ? args[registryIdx + 1] : undefined;
const provenance = args.includes('--provenance');

// Lower rank publishes earlier. Operates on the tarball filename: npm packs a
// scoped package @ts-runtypes/<x> as ts-runtypes-<x>-<version>.tgz, so the
// binary-* leaves sort before the bin launcher before the FE packages.
function rank(name) {
  if (name.startsWith('ts-runtypes-binary-')) return 0;
  if (name.startsWith('ts-runtypes-bin-')) return 1;
  return 2; // FE packages (@ts-runtypes/core, @ts-runtypes/devtools)
}

function main() {
  const tarballs = fs
    .readdirSync(TARBALLS)
    .filter((file) => file.endsWith('.tgz'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (tarballs.length === 0) throw new Error(`no tarballs in ${TARBALLS}`);

  // --registry (verdaccio e2e) is a plain publish into the throwaway registry;
  // everywhere else (CI / release) stages into the public registry's queue for a
  // later 2FA approval.
  const staged = !registry;
  for (const tarball of tarballs) {
    const cmd = staged ? ['stage', 'publish'] : ['publish'];
    cmd.push(path.join(TARBALLS, tarball), '--access', 'public');
    if (registry) cmd.push('--registry', registry);
    if (staged && provenance) cmd.push('--provenance');
    console.log(`${staged ? 'staging' : 'publishing'} ${tarball}${registry ? ` -> ${registry}` : ''}`);
    execFileSync('npm', cmd, {cwd: REPO_ROOT, stdio: 'inherit'});
  }

  if (staged) {
    console.log(`\nStaged ${tarballs.length} packages to the npm stage queue (no 2FA).`);
    console.log('Promote to live with a 2FA approval, leaves-first: pnpm rtx release stage-approve');
  } else {
    console.log(`\nPublished ${tarballs.length} packages -> ${registry}.`);
  }
}

main();

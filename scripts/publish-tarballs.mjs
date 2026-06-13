#!/usr/bin/env node
// Publishes the packed tarballs/ to npm (or a --registry) in dependency-safe
// order: every ts-runtypes-binary-<os>-<arch> FIRST, then ts-runtypes-bin (the
// launcher), then the FE packages — so the launcher never lands referencing
// optional deps that aren't on the registry yet.
//
// Flags:
//   --registry <url>  publish to a specific registry (e.g. local verdaccio).
//   --provenance      add npm provenance (real npm publish in CI; needs
//                     id-token:write + NODE_AUTH_TOKEN).

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');

const args = process.argv.slice(2);
const registryIdx = args.indexOf('--registry');
const registry = registryIdx !== -1 ? args[registryIdx + 1] : undefined;
const provenance = args.includes('--provenance');

// Lower rank publishes earlier.
function rank(name) {
  if (name.startsWith('ts-runtypes-binary-')) return 0;
  if (name.startsWith('ts-runtypes-bin-')) return 1;
  return 2; // FE packages (ts-runtypes, runtypes-devtools)
}

function main() {
  const tarballs = fs
    .readdirSync(TARBALLS)
    .filter((file) => file.endsWith('.tgz'))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  if (tarballs.length === 0) throw new Error(`no tarballs in ${TARBALLS}`);

  for (const tarball of tarballs) {
    const cmd = ['publish', path.join(TARBALLS, tarball), '--access', 'public'];
    if (registry) cmd.push('--registry', registry);
    if (provenance) cmd.push('--provenance');
    console.log(`publishing ${tarball}${registry ? ` -> ${registry}` : ''}`);
    execFileSync('npm', cmd, {cwd: REPO_ROOT, stdio: 'inherit'});
  }
  console.log(`\nPublished ${tarballs.length} packages.`);
}

main();

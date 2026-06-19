#!/usr/bin/env node
// Packs every publishable package into tarballs/ for the verdaccio-backed e2e
// (and as the exact artifacts the publish job ships):
//   - FE packages (ts-runtypes, runtypes-devtools) via `pnpm pack`, so the
//     workspace:* dep on ts-runtypes-bin is rewritten to a concrete version.
//   - launcher + the 7 platform packages from dist-binaries/ (already assembled
//     by build-binary-packages.mjs, optionalDependencies filled) via `npm pack`.
//
// Run AFTER `node scripts/build-binary-packages.mjs` and a JS `build`.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARBALLS = path.join(REPO_ROOT, 'tarballs');
const DIST_BINARIES = path.join(REPO_ROOT, 'dist-binaries');
const FE_PACKAGES = ['ts-runtypes', 'runtypes-devtools'];

function pack(cmd, dir) {
  // pnpm/npm pack both accept --pack-destination and emit <name>-<version>.tgz.
  execFileSync(cmd, ['pack', '--pack-destination', TARBALLS], {cwd: dir, stdio: 'inherit'});
}

function main() {
  if (!fs.existsSync(DIST_BINARIES)) {
    throw new Error('dist-binaries/ missing — run `node scripts/build-binary-packages.mjs` first.');
  }
  fs.rmSync(TARBALLS, {recursive: true, force: true});
  fs.mkdirSync(TARBALLS, {recursive: true});

  // FE packages: pnpm pack rewrites the workspace:* protocol to the version.
  for (const name of FE_PACKAGES) pack('pnpm', path.join(REPO_ROOT, 'packages', name));

  // Launcher + platform packages: plain assembled dirs, no workspace deps.
  for (const entry of fs.readdirSync(DIST_BINARIES)) {
    const dir = path.join(DIST_BINARIES, entry);
    if (fs.statSync(dir).isDirectory()) execFileSync('npm', ['pack', dir, '--pack-destination', TARBALLS], {cwd: REPO_ROOT, stdio: 'inherit'});
  }

  const tarballs = fs.readdirSync(TARBALLS).filter((file) => file.endsWith('.tgz')).sort();
  console.log(`\nPacked ${tarballs.length} tarballs into ${path.relative(REPO_ROOT, TARBALLS)}/:`);
  for (const tarball of tarballs) console.log('  ' + tarball);
}

main();

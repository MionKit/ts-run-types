#!/usr/bin/env node
// Runs the Go binary against the marker package's test sources and emits a
// Vite-build-style snapshot under logs/build/ (or logs/build-<mode>/ for the
// non-default module modes, so runs can be diffed side by side):
//
//   logs/build*/test/suites/<…>/<Fixture>.js  — rewritten fixture source
//                                               (original .ts with the
//                                               import block + tuple-arg
//                                               bindings the plugin would
//                                               splice in at transform).
//   logs/build*/virtual-rt/<basename>.js      — one file per virtual cache
//                                               module (runtype bundle +
//                                               facades + type-fn entries +
//                                               pure-fn entries + missing
//                                               stubs). Identical in shape
//                                               to what Vite's load() hook
//                                               serves for `virtual:rt/<…>`.
//
// Usage:
//   node scripts/dump-test-modules.mjs [--module-mode default|allSingle|allModules] [--no-cache-functions]
//
// --no-cache-functions snapshots the plugin's production default
// (emitCacheFunctions=false: code strings only, no inline g_<hash>
// factories) under logs/build-nofns*/ for byte-size comparisons.
//
// No bundling — every entry module is its own .js, and every fixture
// has its rewritten counterpart at the matching relative path. Browse
// the output dir to inspect what the plugin produces per module mode.

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';
import {rewrite} from '../packages/vite-plugin-runtypes/dist/rewrite.js';
import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
} from '../packages/vite-plugin-runtypes/dist/runtypes-constants.generated.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const MARKER_PKG = path.join(REPO_ROOT, 'packages/ts-go-run-types');
const SUITES_ROOT = path.join(MARKER_PKG, 'test/suites');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');

const MODULE_MODES = [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES];
const moduleModeArgIndex = process.argv.indexOf('--module-mode');
const MODULE_MODE = moduleModeArgIndex >= 0 ? process.argv[moduleModeArgIndex + 1] : MODULE_MODE_DEFAULT;
if (!MODULE_MODES.includes(MODULE_MODE)) {
  console.error(`--module-mode: unknown value ${JSON.stringify(MODULE_MODE)} (expected ${MODULE_MODES.join(' | ')})`);
  process.exit(1);
}
const EMIT_CACHE_FUNCTIONS = !process.argv.includes('--no-cache-functions');

// Default keeps the familiar logs/build/; other modes get their own dir so
// the three layouts can be inspected side by side. The production-default
// (--no-cache-functions) snapshot gets a -nofns suffix for the same reason.
const MODE_DIR = MODULE_MODE === MODULE_MODE_DEFAULT ? 'logs/build' : `logs/build-${MODULE_MODE}`;
const OUT_DIR = path.join(REPO_ROOT, EMIT_CACHE_FUNCTIONS ? MODE_DIR : `${MODE_DIR}-nofns`);
const VIRTUAL_DIR = path.join(OUT_DIR, 'virtual-rt');

// Collect every fixture .ts under test/suites/, skipping the .test.ts
// counterparts (those are the runners, not the marker call sites — they
// rarely contain createX themselves; fixtures own the calls).
function listFixtures(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFixtures(abs));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(BIN)) {
    console.error(`ts-go-run-types binary not built: ${BIN}`);
    console.error('Run: go build -o bin/ts-go-run-types ./cmd/ts-go-run-types');
    process.exit(1);
  }

  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.mkdirSync(VIRTUAL_DIR, {recursive: true});

  // Spawn the binary in --one-shot mode against the tsconfig so the Program
  // is built once at startup from disk (no setSources handshake needed —
  // every fixture is already on the filesystem). emitCacheFunctions:true
  // (the default here) mirrors the marker package's own vitest config so
  // the inline createRTFn closure is part of the snapshot;
  // --no-cache-functions flips to the plugin's production default.
  const resolver = new ResolverClient(BIN, MARKER_PKG, 'tsconfig.test.json', {
    emitCacheFunctions: EMIT_CACHE_FUNCTIONS,
    moduleMode: MODULE_MODE,
  });
  // Surface child stderr so resolver build/scan errors aren't silent.
  // ResolverClient buffers stdout JSON; stderr leaks under us. The
  // spawn API on the client doesn't expose the child handle, so we
  // wrap a process.exit on any unhandled rejection instead.
  process.on('unhandledRejection', (err) => {
    console.error('resolver error:', err);
    resolver.close();
    process.exit(1);
  });

  const fixtures = listFixtures(SUITES_ROOT);
  let rewriteCount = 0;
  let skipCount = 0;

  for (const abs of fixtures) {
    const rel = path.relative(MARKER_PKG, abs);
    const code = fs.readFileSync(abs, 'utf8');
    const result = await rewrite(rel, code, resolver);
    if (result.sites.length === 0 && result.replacements.length === 0) {
      skipCount++;
      continue;
    }
    const outFile = path.join(OUT_DIR, rel).replace(/\.ts$/, '.js');
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(outFile, result.code);
    rewriteCount++;
  }

  // After every fixture has been scanned, dump pulls back the full
  // session — every demanded entry module across all suites.
  const dump = await resolver.dump();
  const entries = dump.entryModules ?? {};
  // Pure-fn entry basenames carry their namespace as path segments
  // (e.g. `pf/mion/asJSONString`), so mkdir-p the parent before writing.
  for (const [basename, source] of Object.entries(entries)) {
    const target = path.join(VIRTUAL_DIR, `${basename}.js`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, source);
  }

  resolver.close();
  const relOut = path.relative(REPO_ROOT, OUT_DIR);
  console.log(
    `dump-test-modules[${MODULE_MODE}]: ${rewriteCount} fixture${rewriteCount === 1 ? '' : 's'} rewritten ` +
      `(${skipCount} skipped, no marker calls), ${Object.keys(entries).length} virtual module${
        Object.keys(entries).length === 1 ? '' : 's'
      } emitted under ${relOut}/`
  );
}

main();

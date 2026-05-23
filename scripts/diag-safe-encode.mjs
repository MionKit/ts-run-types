// Smoke test: drive scanFiles + dump for a few shapes through
// createPrepareForJsonSafe, exercise round-trip via the existing
// createRestoreFromJson decoder, and verify (a) round-trip, (b) input
// is byte-for-byte unchanged after the call, (c) extras are stripped.
//
// Run via: node scripts/diag-safe-encode.mjs

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import {createServer} from 'vite';
import runtypesPlugin from '../packages/vite-plugin-runtypes/dist/index.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');

const TEST_SRC = `
import {createPrepareForJson, createPrepareForJsonSafe, createRestoreFromJson} from '@mionjs/ts-go-run-types';

// === Shape A: flat object with a Date + bigint transform.
export const safeA = createPrepareForJsonSafe<{a: string; b: Date; c: bigint}>();
export const unsafeA = createPrepareForJson<{a: string; b: Date; c: bigint}>();
export const decodeA = createRestoreFromJson<{a: string; b: Date; c: bigint}>();

// === Shape B: all JSON-compatible required props (Approach 3 fastpath).
export const safeB = createPrepareForJsonSafe<{a: string; b: number; c: boolean}>();
export const decodeB = createRestoreFromJson<{a: string; b: number; c: boolean}>();

// === Shape C: optional props.
export const safeC = createPrepareForJsonSafe<{a: string; b?: number; c?: Date}>();
export const decodeC = createRestoreFromJson<{a: string; b?: number; c?: Date}>();

// === Shape D: nested object.
export const safeD = createPrepareForJsonSafe<{outer: string; inner: {a: bigint; b: string}}>();
export const decodeD = createRestoreFromJson<{outer: string; inner: {a: bigint; b: string}}>();

// === Shape E: discriminated union of objects.
type Variant = {kind: 'a'; v: bigint} | {kind: 'b'; v: Date};
export const safeE = createPrepareForJsonSafe<Variant>();
export const decodeE = createRestoreFromJson<Variant>();

// === Shape F: array of objects with transforms.
export const safeF = createPrepareForJsonSafe<{when: Date}[]>();
export const decodeF = createRestoreFromJson<{when: Date}[]>();

// === Shape G: number[] | Date — the previously-broken union shape.
export const safeG = createPrepareForJsonSafe<number[] | Date>();
export const decodeG = createRestoreFromJson<number[] | Date>();
`;

const TEST_PATH = path.join(REPO_ROOT, 'packages/ts-go-run-types/test/__diag_safe_encode.ts');
fs.writeFileSync(TEST_PATH, TEST_SRC);

const server = await createServer({
  root: REPO_ROOT,
  configFile: false,
  server: {middlewareMode: true, watch: null},
  appType: 'custom',
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  optimizeDeps: {noDiscovery: true},
  logLevel: 'error',
  plugins: [
    runtypesPlugin({
      binary: BIN,
      cwd: path.join(REPO_ROOT, 'packages/ts-go-run-types'),
      tsconfig: 'tsconfig.test.json',
    }),
  ],
});

function snap(v) {
  return JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? 'BIGINT:' + val.toString() : val));
}

function check(label, safe, decode, original) {
  const before = snap(original);
  let encoded, encodedSnap, parsed, restored;
  try {
    encoded = safe(original);
    encodedSnap = JSON.stringify(encoded);
    const justAfterEncode = snap(original);
    if (justAfterEncode !== before) {
      console.log(`  ${label}`);
      console.log(`    input:    ${before}`);
      console.log(`    after encode: ${justAfterEncode}    ✗ ENCODE MUTATED INPUT`);
      return;
    }
    parsed = JSON.parse(encodedSnap);
    restored = decode(parsed);
  } catch (e) {
    console.log(`  ${label}  ✗ threw: ${e.message}`);
    return;
  }
  const after = snap(original);
  const restoredSnap = snap(restored);
  const mutated = before !== after;
  const roundtrip = restoredSnap === before;
  console.log(`  ${label}`);
  console.log(`    input:    ${before}`);
  console.log(`    encoded:  ${encodedSnap}`);
  console.log(`    restored: ${restoredSnap}`);
  console.log(
    `    mutation: ${mutated ? '✗ MUTATED ORIGINAL → ' + after : '✓ untouched'}    round-trip: ${roundtrip ? '✓' : '✗ MISMATCH'}`
  );
}

function checkExtrasStrip(label, safe, original) {
  const before = snap(original);
  const encoded = safe(original);
  const after = snap(original);
  const encJson = JSON.stringify(encoded);
  const hasExtra = encJson.includes('"extra"');
  console.log(`  ${label}`);
  console.log(`    input:    ${before}`);
  console.log(`    encoded:  ${encJson}`);
  console.log(
    `    mutation: ${before !== after ? '✗ MUTATED' : '✓ untouched'}    extras: ${hasExtra ? '✗ LEAKED' : '✓ stripped'}`
  );
}

try {
  const mod = await server.ssrLoadModule(TEST_PATH);

  console.log('=== A: {a: string; b: Date; c: bigint} ===');
  check('round-trip via Safe', mod.safeA, mod.decodeA, {a: 'hello', b: new Date('2024-01-01T00:00:00.000Z'), c: 42n});
  checkExtrasStrip('strips extras', mod.safeA, {a: 'hello', b: new Date('2024-01-01T00:00:00.000Z'), c: 42n, extra: 'leak?'});

  console.log('\n=== B: all-required JSON-compat (Approach 3 fastpath) ===');
  check('round-trip — clean input', mod.safeB, mod.decodeB, {a: 'hello', b: 1, c: true});
  checkExtrasStrip('strips extras', mod.safeB, {a: 'hello', b: 1, c: true, extra: 99});

  console.log('\n=== C: mixed optional ===');
  check('round-trip — all present', mod.safeC, mod.decodeC, {a: 'hello', b: 2, c: new Date('2024-01-01T00:00:00.000Z')});
  check('round-trip — optional absent', mod.safeC, mod.decodeC, {a: 'hello'});
  checkExtrasStrip('strips extras', mod.safeC, {a: 'hello', b: 2, extra: 'x'});

  console.log('\n=== D: nested object ===');
  check('round-trip', mod.safeD, mod.decodeD, {outer: 'top', inner: {a: 99n, b: 'nested'}});
  checkExtrasStrip('strips nested extras', mod.safeD, {
    outer: 'top',
    inner: {a: 99n, b: 'nested', extra: 'leak'},
    extra: 'top-leak',
  });

  console.log('\n=== E: union {kind:a; v: bigint} | {kind:b; v: Date} ===');
  check('round-trip variant a', mod.safeE, mod.decodeE, {kind: 'a', v: 42n});
  check('round-trip variant b', mod.safeE, mod.decodeE, {kind: 'b', v: new Date('2024-01-01T00:00:00.000Z')});

  console.log('\n=== F: array of objects with transform ===');
  check('round-trip', mod.safeF, mod.decodeF, [
    {when: new Date('2024-01-01T00:00:00.000Z')},
    {when: new Date('2024-02-02T00:00:00.000Z')},
  ]);

  console.log('\n=== G: number[] | Date (the previously-broken shape) ===');
  check('round-trip — number[]', mod.safeG, mod.decodeG, [5, 7]);
  check('round-trip — Date', mod.safeG, mod.decodeG, new Date('2024-01-01T00:00:00.000Z'));
} finally {
  fs.unlinkSync(TEST_PATH);
  await server.close();
}

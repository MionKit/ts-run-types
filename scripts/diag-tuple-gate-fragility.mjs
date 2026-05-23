// DIAGNOSTIC: prove the decoder's tuple-shape heuristic
// (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number')
// produces FALSE POSITIVES on legitimate user values.
//
// Run via: node scripts/diag-tuple-gate-fragility.mjs

import path from 'node:path';
import url from 'node:url';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';
import {createServer} from 'vite';
import runtypesPlugin from '../packages/vite-plugin-runtypes/dist/index.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');

const TEST_SRC = `
import {createPrepareForJson, createStringifyJson, createRestoreFromJson, createPrepareForJsonFlat, createStringifyJsonFlat, createRestoreFromJsonFlat} from '@mionjs/ts-go-run-types';

// Case A: number[] | Date. number[] is encode-noop (no wrap),
// Date encodes as [1, "ISO..."]. A value of [5, 7] (legit number[])
// would be misread by the decoder's heuristic gate.
export const sjA = createStringifyJson<number[] | Date>();
export const rjA = createRestoreFromJson<number[] | Date>();
export const sjfA = createStringifyJsonFlat<number[] | Date>();
export const rjfA = createRestoreFromJsonFlat<number[] | Date>();

// Case B: [number, string] tuple in a union with Date. Tuple itself
// produces a length-2 array starting with number — perfect false positive.
export const sjB = createStringifyJson<[number, string] | Date>();
export const rjB = createRestoreFromJson<[number, string] | Date>();
export const sjfB = createStringifyJsonFlat<[number, string] | Date>();
export const rjfB = createRestoreFromJsonFlat<[number, string] | Date>();

// Case C: number[][] | Date. The inner element is also number[];
// a value like [[5, 7]] (length 1) is fine, but [[1], [2]] (length 2 with
// typeof v[0] = 'object', not 'number') is fine too because the gate
// requires typeof v[0] === 'number'. So this one might pass.
export const sjC = createStringifyJson<number[][] | Date>();
export const rjC = createRestoreFromJson<number[][] | Date>();
`;

// Write the test file BEFORE creating the server so tsgo's program
// (configured via tsconfig.test.json) picks it up at startup.
import fs from 'node:fs';
const TEST_PATH = path.join(REPO_ROOT, 'packages/ts-go-run-types/test/__diag_tuple_gate.ts');
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

try {
  const mod = await server.ssrLoadModule(TEST_PATH);

  function trip(label, encode, decode, value) {
    console.log(`\n  ${label}: input = ${JSON.stringify(value, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    let json;
    try {
      json = encode(value);
      console.log(`    encoded JSON: ${json}`);
    } catch (e) { console.log(`    encode threw: ${e.message}`); return; }
    let restored;
    try {
      restored = decode(JSON.parse(json));
      const same = JSON.stringify(restored, (k, v) => typeof v === 'bigint' ? v.toString() : v) === JSON.stringify(value, (k, v) => typeof v === 'bigint' ? v.toString() : v);
      console.log(`    restored: ${JSON.stringify(restored)} ${same ? '✓ ROUND-TRIP OK' : '✗ MISMATCH'}`);
    } catch (e) { console.log(`    decode threw: ${e.message}  ← BUG`); }
  }

  console.log('=========================================================');
  console.log('Case A: number[] | Date');
  console.log('=========================================================');
  console.log('\n NON-FLAT:');
  trip('  numeric array len 2', mod.sjA, mod.rjA, [5, 7]);
  trip('  numeric array len 3', mod.sjA, mod.rjA, [5, 7, 9]);
  trip('  Date',                mod.sjA, mod.rjA, new Date('2024-01-01'));
  console.log('\n FLAT:');
  trip('  numeric array len 2', mod.sjfA, mod.rjfA, [5, 7]);
  trip('  numeric array len 3', mod.sjfA, mod.rjfA, [5, 7, 9]);
  trip('  Date',                mod.sjfA, mod.rjfA, new Date('2024-01-01'));

  console.log('\n=========================================================');
  console.log('Case B: [number, string] tuple | Date');
  console.log('=========================================================');
  console.log('\n NON-FLAT:');
  trip('  tuple [5, "hi"]', mod.sjB, mod.rjB, [5, 'hi']);
  trip('  Date',            mod.sjB, mod.rjB, new Date('2024-01-01'));
  console.log('\n FLAT:');
  trip('  tuple [5, "hi"]', mod.sjfB, mod.rjfB, [5, 'hi']);
  trip('  Date',            mod.sjfB, mod.rjfB, new Date('2024-01-01'));

  console.log('\n=========================================================');
  console.log('Case C: number[][] | Date (control — outer typeof v[0] is "object", not "number")');
  console.log('=========================================================');
  trip('  [[5, 7]]',     mod.sjC, mod.rjC, [[5, 7]]);
  trip('  [[5], [7]]',   mod.sjC, mod.rjC, [[5], [7]]);
} finally {
  fs.unlinkSync(TEST_PATH);
  await server.close();
}

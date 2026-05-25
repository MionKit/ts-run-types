#!/usr/bin/env node
// Diagnostic: drive scanFiles directly against the daemon and print BOTH
// stringifyJson and stringifyJsonFlat rendered cache modules for the
// regressing object-union cases so we can read them side-by-side.
//
// scanFiles is called with all source files in one batch so the daemon's
// scoped projection covers them; includeCacheSources: ['all'] forces every
// cache module to render. We dump the response field-by-field to stderr
// for visibility into which kinds emitted a body and which were empty.

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');
const OUT_DIR = path.join(REPO_ROOT, 'logs/diag-direct');

const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
  export interface RunTypeOptions {}
  export type StringifyJsonFn = (v: unknown) => string | undefined;
  export type StringifyJsonFlatFn = StringifyJsonFn;
  export type PrepareForJsonFn = (v: unknown) => unknown;
  export type PrepareForJsonFlatFn = PrepareForJsonFn;
  export function createStringifyJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFn;
  export function createStringifyJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFlatFn;
  export function createPrepareForJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFn;
  export function createPrepareForJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFlatFn;
}
`;

const CASES = [
  {
    name: 'union_object_3',
    sources: {
      'union3.ts': `import {createStringifyJson, createStringifyJsonFlat, createPrepareForJson, createPrepareForJsonFlat} from '@mionjs/ts-go-run-types';
type A = {discriminator: 'a'; name: string; date: Date};
type B = {discriminator: 'b'; name: string; date: Date};
type C = {discriminator: 'c'; name: string; date: Date};
type U = A | B | C;
const sj = createStringifyJson<U>();
const sjf = createStringifyJsonFlat<U>();
const pj = createPrepareForJson<U>();
const pjf = createPrepareForJsonFlat<U>();
void sj; void sjf; void pj; void pjf;
`,
    },
  },
  {
    name: 'union_5_events',
    sources: {
      'union5.ts': `import {createStringifyJson, createStringifyJsonFlat, createPrepareForJson, createPrepareForJsonFlat} from '@mionjs/ts-go-run-types';
interface ProductEvent { kind: 'product'; id: string; sku: string; price: number; available: boolean; releasedAt: Date; stock: number; }
interface UserEvent { kind: 'user'; id: string; username: string; email: string; signedUpAt: Date; loginCount: number; isPremium: boolean; }
interface OrderEvent { kind: 'order'; id: string; total: number; itemCount: number; placedAt: Date; shipped: boolean; customerId: string; }
interface PaymentEvent { kind: 'payment'; id: string; amount: number; currency: string; processedAt: Date; refunded: boolean; txId: string; }
interface SessionEvent { kind: 'session'; id: string; userId: string; startedAt: Date; durationMs: number; ipHash: string; device: string; }
type U = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
const sj = createStringifyJson<U>();
const sjf = createStringifyJsonFlat<U>();
const pj = createPrepareForJson<U>();
const pjf = createPrepareForJsonFlat<U>();
void sj; void sjf; void pj; void pjf;
`,
    },
  },
];

const KINDS = ['runType', 'stringifyJson', 'stringifyJsonFlat', 'prepareForJson', 'prepareForJsonFlat'];

fs.rmSync(OUT_DIR, {recursive: true, force: true});
fs.mkdirSync(OUT_DIR, {recursive: true});

const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true});
try {
  for (const c of CASES) {
    const caseDir = path.join(OUT_DIR, c.name);
    fs.mkdirSync(caseDir, {recursive: true});
    await client.reset();
    await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, ...c.sources});
    const files = Object.keys(c.sources);
    // Drive scanFiles WITH includeCacheSources to test the (buggy) scoped
    // projection path, then drive a separate `dump` request — that's the
    // same path the vite plugin's transform() hook uses and returns the
    // FULL session-wide cache (no per-request scoped projection).
    const scanResp = await client.scanFiles(files, {includeCacheSources: ['all']});
    const dumpResp = await client.dump({includeCacheSources: ['all']});
    process.stdout.write(`\n# ${c.name}\n`);
    process.stdout.write(`  sites: ${scanResp.sites?.length ?? 0}\n`);
    process.stdout.write(`  kind:                  scanFiles    dump\n`);
    for (const kind of [...KINDS, 'isType', 'restoreFromJson', 'restoreFromJsonFlat', 'pureFns']) {
      const scanBody = scanResp[kind + 'CacheSource'];
      const dumpBody = dumpResp[kind + 'CacheSource'];
      const scanLen = typeof scanBody === 'string' ? scanBody.length : 0;
      const dumpLen = typeof dumpBody === 'string' ? dumpBody.length : 0;
      const warn = scanLen === 0 && dumpLen > 0 ? '  ⚠️ SCAN MISSING' : '';
      process.stdout.write(`  ${kind.padEnd(22)} ${String(scanLen).padStart(8)} ${String(dumpLen).padStart(8)}${warn}\n`);
      if (dumpLen > 0) fs.writeFileSync(path.join(caseDir, `${kind}.js`), dumpBody);
    }
    // Also dump the raw response shape (sans cache sources) for inspection.
    const stripped = {};
    for (const [k, v] of Object.entries(dumpResp)) {
      if (k.endsWith('CacheSource')) continue;
      stripped[k] = v;
    }
    fs.writeFileSync(path.join(caseDir, '_response.json'), JSON.stringify(stripped, null, 2));
  }
} finally {
  client.close();
}

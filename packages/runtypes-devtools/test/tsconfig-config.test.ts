// Build-path proof that the Go binary reads project knobs from the tsconfig
// ts-runtypes plugin entry, with tsc-style precedence: a flag forwarded over
// the wire overrides the tsconfig value, which overrides the binary default.
//
// The signal is moduleMode: in 'allSingle' a getRunTypeId site rides the
// shared runtypes bundle (site.module === RUNTYPES_BUNDLE_BASENAME); in the
// default layout it rides a per-root facade (a different module). Driving
// moduleMode ONLY through tsconfig (no moduleMode forwarded) means the bundle
// routing can ONLY come from the build path having read the tsconfig.
//
// Each case is a real default-mode resolver (--one-shot --tsconfig against an
// on-disk fixture), NOT the inline / server modes the other suites use — those
// carry no tsconfig, so they never exercise this path.

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {ResolverClient} from '../src/resolver-client.ts';
import {BIN, runIfBinary, RUNTYPES_DTS} from './helpers/inline.ts';
import {MODULE_MODE_ALL_SINGLE, RUNTYPES_BUNDLE_BASENAME} from '../src/runtypes-constants.generated.ts';

const register = runIfBinary(it);

// Both getRunTypeId call shapes in one file (marker coverage rule): the static
// form supplies T, the reflection form infers it from a value. Equivalent T, so
// both sites must resolve to the SAME typeId.
const ENTRY = `import {getRunTypeId} from 'ts-runtypes';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
const u = {id: 1, name: 'm'} as User;
export const reflectedId = getRunTypeId(u);
`;

function tsconfig(pluginEntry: string): string {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": [],
    "plugins": [${pluginEntry}]
  },
  "include": ["*.ts"]
}`;
}

// makeFixture writes a self-contained project (ambient ts-runtypes shim + one
// source + a tsconfig carrying pluginEntry) into a fresh temp dir.
function makeFixture(pluginEntry: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-tsconfig-'));
  fs.writeFileSync(path.join(dir, 'runtypes.d.ts'), RUNTYPES_DTS);
  fs.writeFileSync(path.join(dir, 'entry.ts'), ENTRY);
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), tsconfig(pluginEntry));
  return dir;
}

// scanModules spawns a default-mode resolver against the fixture's tsconfig and
// returns the recorded sites. cacheDir:'' forwards an explicit disable so the
// run never writes under node_modules.
async function scanSites(dir: string, opts: {moduleMode?: string} = {}) {
  const client = new ResolverClient(BIN, dir, 'tsconfig.json', {cacheDir: '', ...opts});
  try {
    const resp = await client.scanFiles(['entry.ts']);
    return resp.sites;
  } finally {
    client.close();
  }
}

describe('runtypes-devtools / tsconfig plugin config (build path)', () => {
  register(
    'tsconfig moduleMode:allSingle is honored; both getRunTypeId shapes share one typeId',
    async () => {
      const dir = makeFixture(`{ "name": "ts-runtypes", "moduleMode": "${MODULE_MODE_ALL_SINGLE}" }`);
      try {
        const sites = await scanSites(dir);
        expect(sites.length).toBe(2);
        // Hash equivalence: static getRunTypeId<User>() and reflection
        // getRunTypeId(u) resolve to the same cache entry.
        expect(sites[0].id).toBe(sites[1].id);
        // allSingle routes every getRunTypeId site to the shared runtypes
        // bundle — only possible if the build path read the tsconfig entry.
        expect(sites.every((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(true);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'a forwarded --module-mode overrides the tsconfig entry (flag > tsconfig)',
    async () => {
      const dir = makeFixture(`{ "name": "ts-runtypes", "moduleMode": "${MODULE_MODE_ALL_SINGLE}" }`);
      try {
        // tsconfig says allSingle, but the explicit flag forces the default
        // layout, so neither site lands on the shared bundle.
        const sites = await scanSites(dir, {moduleMode: 'default'});
        expect(sites.length).toBe(2);
        expect(sites[0].id).toBe(sites[1].id);
        expect(sites.some((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );

  register(
    'no ts-runtypes plugin entry falls back to the default layout',
    async () => {
      const dir = makeFixture(`{ "name": "other" }`);
      try {
        const sites = await scanSites(dir);
        expect(sites.length).toBe(2);
        expect(sites.some((s) => s.module === RUNTYPES_BUNDLE_BASENAME)).toBe(false);
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    60_000
  );
});

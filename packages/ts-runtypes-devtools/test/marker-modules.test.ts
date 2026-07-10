// The `markerModules` plugin option — wrapper-framework support for the
// transform's textual pre-filter.
//
// A framework (mion's `route()` is the real-world case) declares its own
// factory with a trailing `InjectTypeFnArgs` param and forwards the handle to a
// public createX. Its USERS' files import the FRAMEWORK's module — the string
// '@ts-runtypes/core' never appears — so the transform pre-filter used to skip
// them: generation saw the sites (whole-program scan) but the per-file rewrite
// never ran and the factories threw "no id injected" at runtime. `markerModules`
// adds the framework's module names to the pre-filter accept list.
//
// The fixture is a self-contained mini project (own tsconfig + the ambient
// marker overlay, mirroring internal/testfixtures/runtypes.d.ts) rather than a
// file inside the marker package's own test program: cross-file wrapper sites
// are currently NOT resolved inside the marker package's self-referential
// program (docs/todos/cross-file-wrapper-sites-not-scanned-in-self-program.md)
// while every consumer-shaped program resolves them fine.
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary, RUNTYPES_DTS} from './helpers/inline.ts';

const FIXTURE_DIR = path.resolve(__dirname, 'tmp-marker-modules');
const WRAPPER = path.join(FIXTURE_DIR, 'wrapper.ts');
const CONSUMER = path.join(FIXTURE_DIR, 'consumer.ts');
const OUT_DIR = path.join(FIXTURE_DIR, '__runtypes');

const TSCONFIG_SRC = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    skipLibCheck: true,
    types: [],
  },
  include: ['*.ts'],
});

// The wrapper imports '@ts-runtypes/core' (it always passes the pre-filter);
// its forwarded createValidate call is an explicit pass-through and must never
// be rewritten. The marker type is used VERBATIM (never aliased) — alias
// declarations are not recognised by the scanner.
const WRAPPER_SRC = `import {createValidate} from '@ts-runtypes/core';
import type {InjectTypeFnArgs, ValidateFn} from '@ts-runtypes/core';

type AnyHandler = (ctx: unknown, ...rest: any[]) => unknown;

export function route<H extends AnyHandler>(handler: H, id?: InjectTypeFnArgs<Parameters<H>, 'val'>) {
  const validate: ValidateFn = createValidate(undefined, undefined, id as never);
  return {handler, validate};
}
`;

// The consumer file NEVER mentions '@ts-runtypes/core' — only the wrapper
// module. This is the file the pre-filter used to skip.
const CONSUMER_SRC = `import {route} from './wrapper';

export const lenRoute = route((ctx: unknown, name: string) => name.length);
`;

type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

const ctx = {
  error(message: string): never {
    throw new Error(message);
  },
  warn(): void {},
};

function makePlugin(markerModules?: string[]) {
  return runtypesRollup({
    binary: BIN,
    cwd: FIXTURE_DIR,
    tsconfig: 'tsconfig.json',
    outDir: OUT_DIR,
    ...(markerModules ? {markerModules} : {}),
  }) as any;
}

describe('markerModules / wrapper-framework pre-filter', () => {
  const register = hasBinary() ? it : it.skip;

  beforeAll(() => {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'tsconfig.json'), TSCONFIG_SRC);
    fs.writeFileSync(path.join(FIXTURE_DIR, 'rt-overlay.d.ts'), RUNTYPES_DTS);
    fs.writeFileSync(WRAPPER, WRAPPER_SRC);
    fs.writeFileSync(CONSUMER, CONSUMER_SRC);
  });
  afterAll(() => fs.rmSync(FIXTURE_DIR, {recursive: true, force: true}));

  register('without markerModules the consumer file is skipped (the documented gap)', async () => {
    const plugin = makePlugin();
    try {
      await callHook(plugin.buildStart, ctx);
      const transformed = await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER);
      expect(transformed, 'pre-filter must skip a file that never names a marker module').toBeNull();
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });

  register('with markerModules the wrapper call site is rewritten; the wrapper forward stays a pass-through', async () => {
    const plugin = makePlugin(['./wrapper']);
    try {
      await callHook(plugin.buildStart, ctx);

      // Consumer: gate passes via the registered module name; the route() call
      // gets the entry binding + a relative import to a real on-disk module.
      const transformed = (await callHook(plugin.transform, ctx, CONSUMER_SRC, CONSUMER)) as {code: string} | null;
      expect(transformed, 'consumer file must be transformed once its wrapper module is registered').toBeTruthy();
      const code = transformed!.code;
      expect(code).toMatch(/route\(\(ctx: unknown, name: string\) => name\.length, __rt_[A-Za-z0-9_]+\)/);
      const match = code.match(/from '(\.\.?\/[^']+\.js)'/);
      expect(match, `expected an injected relative module import in:\n${code}`).toBeTruthy();
      const moduleFile = path.resolve(path.dirname(CONSUMER), match![1]);
      expect(fs.existsSync(moduleFile), `injected import ${match![1]} must point at a written module`).toBe(true);

      // Wrapper: passes the pre-filter (it imports '@ts-runtypes/core') but its
      // forwarded createValidate(undefined, undefined, id) is an explicit
      // pass-through — no injectable site, so the transform returns null.
      const wrapperResult = await callHook(plugin.transform, ctx, WRAPPER_SRC, WRAPPER);
      expect(wrapperResult, 'wrapper forward must stay untouched (pass-through)').toBeNull();
    } finally {
      try {
        await callHook(plugin.buildEnd, ctx);
      } catch {
        // best-effort teardown
      }
    }
  });
});

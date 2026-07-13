#!/usr/bin/env node
// Fast end-to-end smoke for the Go binary + ts-runtypes-devtools wiring.
//
// What it exercises (~1s when everything is healthy):
//   - bin/ts-runtypes spawns and accepts an --inline-server session
//     (no tsconfig handshake; mirrors the test helper).
//   - The plugin's transform() recognises the marker import and produces a
//     Site for both reflection forms AND a createX call.
//   - scanFiles({includeEntryModules: true}) returns the cache modules the
//     resolver would serve to Vite at virtual:rt/<…>.js.
//
// Fixture coverage follows the marker test coverage rule (CLAUDE.md):
//   - getRunTypeId<T>()        — static
//   - getRunTypeId(value)      — reflect (T inferred from value)
//   - createValidate<T>()      — exercises the InjectTypeFnArgs path
//
// Exit codes: 0 PASS, 1 FAIL.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../../packages/ts-runtypes-devtools/dist/resolver-client.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const BIN = path.join(REPO_ROOT, 'bin/ts-runtypes');
const PLUGIN_DIST = path.join(REPO_ROOT, 'packages/ts-runtypes-devtools/dist');

function fail(msg) {
  console.error(`==> smoke: FAIL  ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(BIN)) {
  fail(`missing ${path.relative(REPO_ROOT, BIN)} - run 'pnpm run check:go-binary'`);
}
if (!fs.existsSync(path.join(PLUGIN_DIST, 'resolver-client.js'))) {
  fail(`missing ${path.relative(REPO_ROOT, PLUGIN_DIST)} - run 'pnpm --filter @ts-runtypes/devtools run build'`);
}

// Minimal ambient declaration so the resolver's marker scanner recognises
// `ts-runtypes` without us shipping the real marker package
// (the smoke runs against repo-root, not against packages/ts-runtypes).
const RUNTYPES_DTS = `declare module '@ts-runtypes/core' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export interface ValidateOptions { noLiterals?: boolean; noIsArrayCheck?: boolean; }
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
}
`;

const SOURCES = {
  'runtypes.d.ts': RUNTYPES_DTS,
  'static.ts': `import {getRunTypeId} from '@ts-runtypes/core';\ngetRunTypeId<string>();\n`,
  'reflect.ts': `import {getRunTypeId} from '@ts-runtypes/core';\nconst v: string = 'hi';\ngetRunTypeId(v);\n`,
  'validate.ts': `import {createValidate} from '@ts-runtypes/core';\nconst isUser = createValidate<{name: string}>();\nisUser({name: 'x'});\n`,
};
const FILES = Object.keys(SOURCES).filter((file) => file !== 'runtypes.d.ts');

const started = Date.now();
console.log(`==> smoke: spawning ${path.relative(REPO_ROOT, BIN)} (--inline-server)`);
const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});

let exitCode = 0;
try {
  await client.setSources(SOURCES);

  // 1) Plugin transform for every fixture. Each call site must produce a Site
  //    so the patcher has somewhere to inject the resolved id. transform() is
  //    the resolver op the plugin's transform hook drives (see unplugin.ts); it
  //    reads the in-memory sources set above and returns the file-tagged sites.
  for (const file of FILES) {
    const {sites} = await client.transform([file]);
    if (sites.length === 0) fail(`transform produced no sites for ${file}`);
  }

  // 2) Resolver renders the cache modules the plugin would serve at
  //    virtual:rt/<…>.js. An empty entryModules map means the type-fn /
  //    runtype bundle pipeline never fired.
  const result = await client.scanFiles(FILES, {includeEntryModules: true});
  const sites = result.sites ?? [];
  const entryCount = Object.keys(result.entryModules ?? {}).length;
  if (sites.length < FILES.length) fail(`scanFiles returned ${sites.length} sites for ${FILES.length} fixtures`);
  if (entryCount === 0) fail('scanFiles returned no entryModules');

  const elapsedMs = Date.now() - started;
  console.log(`==> smoke: PASS  ${FILES.length} fixtures rewritten, ${sites.length} sites, ${entryCount} entry modules (${elapsedMs}ms)`);
} catch (err) {
  console.error('==> smoke: FAIL ', err);
  exitCode = 1;
} finally {
  client.close();
}

process.exit(exitCode);

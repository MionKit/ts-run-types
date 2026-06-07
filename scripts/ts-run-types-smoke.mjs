#!/usr/bin/env node
// Fast end-to-end smoke for the Go binary + vite-plugin-runtypes wiring.
//
// What it exercises (~1s when everything is healthy):
//   - bin/ts-go-run-types spawns and accepts an --inline-server session
//     (no tsconfig handshake; mirrors the test helper).
//   - The plugin's rewrite() recognises the marker import and produces a
//     Site for both reflection forms AND a createX call.
//   - scanFiles({includeEntryModules: true}) returns the cache modules the
//     resolver would serve to Vite at virtual:rt/<…>.js.
//
// Fixture coverage follows the marker test coverage rule (CLAUDE.md):
//   - getRunTypeId<T>()        — static
//   - reflectRunTypeId(value)  — reflect
//   - createValidate<T>()      — exercises the InjectTypeFnArgs path
//
// Exit codes: 0 PASS, 1 FAIL.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../packages/vite-plugin-runtypes/dist/resolver-client.js';
import {rewrite} from '../packages/vite-plugin-runtypes/dist/rewrite.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BIN = path.join(REPO_ROOT, 'bin/ts-go-run-types');
const PLUGIN_DIST = path.join(REPO_ROOT, 'packages/vite-plugin-runtypes/dist');

function fail(msg) {
  console.error(`==> smoke: FAIL  ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(BIN)) {
  fail(`missing ${path.relative(REPO_ROOT, BIN)} - run 'pnpm run check:go-binary'`);
}
if (!fs.existsSync(path.join(PLUGIN_DIST, 'resolver-client.js'))) {
  fail(`missing ${path.relative(REPO_ROOT, PLUGIN_DIST)} - run 'pnpm --filter vite-plugin-runtypes run build'`);
}

// Minimal ambient declaration so the resolver's marker scanner recognises
// `@mionjs/ts-go-run-types` without us shipping the real marker package
// (the smoke runs against repo-root, not against packages/ts-go-run-types).
const RUNTYPES_DTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __mionCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __mionInjectTypeFnArgsBrand?: T; readonly __mionInjectTypeFnArgsFn?: Fn};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export interface ValidateOptions { noLiterals?: boolean; noIsArrayCheck?: boolean; }
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
}
`;

const SOURCES = {
  'runtypes.d.ts': RUNTYPES_DTS,
  'static.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';\ngetRunTypeId<string>();\n`,
  'reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';\nconst v: string = 'hi';\nreflectRunTypeId(v);\n`,
  'validate.ts': `import {createValidate} from '@mionjs/ts-go-run-types';\nconst isUser = createValidate<{name: string}>();\nisUser({name: 'x'});\n`,
};
const FILES = Object.keys(SOURCES).filter((file) => file !== 'runtypes.d.ts');

const started = Date.now();
console.log(`==> smoke: spawning ${path.relative(REPO_ROOT, BIN)} (--inline-server)`);
const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});

let exitCode = 0;
try {
  await client.setSources(SOURCES);

  // 1) Plugin rewrite for every fixture. Each call site must produce a Site
  //    so the patcher has somewhere to inject the resolved id.
  for (const file of FILES) {
    const {sites} = await rewrite(file, SOURCES[file], client);
    if (sites.length === 0) fail(`rewrite produced no sites for ${file}`);
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

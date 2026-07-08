// Static assertions over the dist BYTES: prove the RunTypes plugin actually
// transformed the source inside each bundler (not silently no-op'd). Two checks
// per app:
//   1. No residual un-rewritten generic marker calls (`createValidate<…>`,
//      `getRunTypeId<…>`) survive — the transform + TS strip removed them.
//   2. The injected cache wiring is present (the `__rt_` tuple bindings the
//      rewrite threads into each call site), so the output carries generated code.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APPS = path.join(HERE, '..', 'apps');
const ALL = ['build-vite', 'smoke-esbuild', 'smoke-rollup', 'smoke-rolldown', 'smoke-webpack', 'smoke-rspack'];

// An un-rewritten generic marker call still carries its `<…>` type argument.
// After a successful transform + TS strip, no `markerName<` pattern remains.
const RESIDUAL = /\b(?:createValidate|getRunTypeId|getRunType|createJsonEncoder|createJsonDecoder|createBinaryEncoder)\s*</;

for (const app of ALL) {
  test(`${app}: dist shows rewrite evidence (no residual markers, injected wiring present)`, () => {
    const dist = path.join(APPS, app, 'dist/entry.js');
    assert.ok(existsSync(dist), `${app}: dist/entry.js missing`);
    const code = readFileSync(dist, 'utf8');
    assert.ok(!RESIDUAL.test(code), `${app}: found an un-rewritten generic marker call in the dist`);
    assert.ok(code.includes('__rt_'), `${app}: no injected __rt_ cache binding found — the plugin may have no-op'd`);
  });
}

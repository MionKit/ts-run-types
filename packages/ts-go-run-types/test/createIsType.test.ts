// End-to-end acceptance test for createIsType<T>. Drives the FULL
// vite-plugin pipeline via vitest's vite integration: the plugin
// transforms this file at load time (injecting the runtype hash at
// the createIsType call site), serves the `virtual:runtypes-isType`
// module body from the Go-side typefns renderer, and `createIsType`
// at runtime dispatches into the precompiled factory.
//
// Migrated from packages/vite-plugin-runtypes/test/rt-isType.test.ts,
// which used a `new Function` eval shortcut to bypass the bundler.
// The pipeline now works end-to-end via the real plugin so the
// shortcut is redundant.
//
// `@mionjs/ts-go-run-types` resolves to the package's own
// `src/index.ts` via the `"source"` exports condition
// (vite: resolve.conditions; tsgo: customConditions) — see
// CLAUDE.md → Marker package self-import resolution.
//
// Success bar (from plans/the-idea-is-to-groovy-rainbow.md):
//   isType('abc')      === true
//   isType(42)         === false
//   isType(undefined)  === false

import {describe, test, expect} from 'vitest';
import {createIsType} from '@mionjs/ts-go-run-types';

describe('createIsType<T> — string', () => {
  test('validator returns true for strings, false for non-strings', () => {
    const isString = createIsType<string>();
    expect(isString('abc')).toBe(true);
    expect(isString(42)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });

  test('repeated calls return the same cached validator instance', () => {
    const a = createIsType<string>();
    const b = createIsType<string>();
    expect(a).toBe(b);
  });
});

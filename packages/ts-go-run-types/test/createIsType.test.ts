// End-to-end acceptance test for createIsType<T>. Drives the FULL
// vite-plugin pipeline via vitest's vite integration: the plugin
// transforms this file at load time (injecting the runtype hash at
// the createIsType call site), serves the `virtual:runtypes-isType`
// module body from the Go-side jitfn renderer, and `createIsType`
// at runtime dispatches into the precompiled factory.
//
// Migrated from packages/vite-plugin-runtypes/test/jit-isType.test.ts,
// which used a `new Function` eval shortcut to bypass the bundler.
// The pipeline now works end-to-end via the real plugin so the
// shortcut is redundant.
//
// Success bar (from plans/the-idea-is-to-groovy-rainbow.md):
//   isType('abc')      === true
//   isType(42)         === false
//   isType(undefined)  === false

/// <reference path="./runtypes.d.ts" />
import {describe, test, expect} from 'vitest';
import {createIsType} from '@mionjs/ts-go-run-types';

describe('createIsType<T> — string', () => {
  test('validator returns true for strings, false for non-strings', async () => {
    const isString = await createIsType<string>();
    expect(isString('abc')).toBe(true);
    expect(isString(42)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });

  test('repeated calls return the same cached validator instance', async () => {
    const a = await createIsType<string>();
    const b = await createIsType<string>();
    expect(a).toBe(b);
  });
});

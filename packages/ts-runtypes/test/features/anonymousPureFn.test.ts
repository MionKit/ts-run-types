/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getRTUtils, pureFnKey} from '../../src/runtypes/rtUtils.ts';
import {registerAnonymousPureFn} from '../../src/runtypes/pureFn.ts';

// The vitest transform runs the plugin in-process, so each
// registerAnonymousPureFn(inlineFactory) below is rewritten to its entry-module
// tuple + the injected `"rt::<hash>"` id — exactly what a built consumer sees.

// 14-char base64url — what the Go binary's CodeHash emits.
const BODY_HASH_REGEX = /^[A-Za-z0-9_-]{14}$/;

// Reconstruct the injected `rt::<hash>` key from a returned CompiledPureFunction.
function keyOf(compiled: {namespace: string; fnName: string}): string {
  return pureFnKey(compiled.namespace, compiled.fnName);
}

describe('registerAnonymousPureFn — content-addressed registration', () => {
  it('registers under a content hash and returns a callable compiled fn', () => {
    const compiled = registerAnonymousPureFn(function () {
      return function _double(n: number): number {
        return n * 2;
      };
    });
    expect(compiled).toBeDefined();
    expect(compiled.namespace).toBe('rt');
    expect(compiled.fnName).toMatch(BODY_HASH_REGEX);

    const key = keyOf(compiled);
    // The registered entry is looked up under the injected key.
    const restored = getRTUtils().getPureFn(key) as (n: number) => number;
    expect(restored).toBeInstanceOf(Function);
    expect(restored(21)).toBe(42);
  });

  it('collapses structurally-identical bodies to one entry (content-addressed dedup)', () => {
    const first = registerAnonymousPureFn(function () {
      return function _same(s: string): string {
        return s.trim();
      };
    });
    const second = registerAnonymousPureFn(function () {
      return function _same(s: string): string {
        return s.trim();
      };
    });
    // Same body → same injected id → same registered entry.
    expect(keyOf(second)).toBe(keyOf(first));
  });

  it('gives different bodies different ids', () => {
    const upper = registerAnonymousPureFn(function () {
      return function _up(s: string): string {
        return s.toUpperCase();
      };
    });
    const lower = registerAnonymousPureFn(function () {
      return function _down(s: string): string {
        return s.toLowerCase();
      };
    });
    expect(keyOf(lower)).not.toBe(keyOf(upper));
  });
});

describe('runtime-key lookup accessors (untracked)', () => {
  it('getPureFnByKey / hasPureFnByKey resolve a registered anonymous pure fn by a runtime string', () => {
    const compiled = registerAnonymousPureFn(function () {
      return function _inc(n: number): number {
        return n + 1;
      };
    });
    // A runtime key — the string is built at runtime (as a framework dispatching
    // on a wire-provided id would), NOT a comptime literal. The accessor is not
    // build-tracked, so this is allowed.
    const wireKey: string = ['rt', compiled.fnName].join('::');

    expect(getRTUtils().hasPureFnByKey(wireKey)).toBe(true);
    const fn = getRTUtils().getPureFnByKey(wireKey) as (n: number) => number;
    expect(fn).toBeInstanceOf(Function);
    expect(fn(41)).toBe(42);
  });

  it('returns undefined / false for an unregistered runtime key', () => {
    const missing = 'rt::' + 'notRegistered0';
    expect(getRTUtils().hasPureFnByKey(missing)).toBe(false);
    expect(getRTUtils().getPureFnByKey(missing)).toBeUndefined();
  });
});

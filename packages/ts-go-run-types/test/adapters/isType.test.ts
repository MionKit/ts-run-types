// isType adapter — runs every atomic ValidationCase whose `isType`
// thunk is defined against the precompiled validator the Go binary
// emits via internal/caches/jitfn/istype.go.
//
// Shape mirrors mion-run-types:packages/run-types/src/jitCompilers/json/jsonSpec/01JsonAtomic.spec.ts:
// one explicit `it(...)` per case (no for-loop registration — keeps
// the failure surface readable and lets the IDE jump to each test),
// an `afterEach` counter, and a final coverage-guard test that fails
// if a new case lands in the suite without a matching `it()` here.
//
// To add a new atomic case: declare it in
// test/suites/validation-suite.ts AND add a one-line `it(<key>, …)`
// below in suite-declaration order. The counter test surfaces the
// drift if you only do one.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

let ranTests = 0;
afterEach(() => {
  ranTests++;
});

async function assertIsType(c: ValidationCase): Promise<void> {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);
  const isType = await c.isType();
  const {valid, invalid} = c.getSamples();
  valid.forEach((v, i) => {
    expect(isType(v), `${c.title}: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isType(v), `${c.title}: invalid[${i}] should fail`).toBe(false);
  });
}

describe('isType / ATOMIC', () => {
  it('any', () => assertIsType(VALIDATION_SUITE.ATOMIC.any));
  it('bigint', () => assertIsType(VALIDATION_SUITE.ATOMIC.bigint));
  it('boolean', () => assertIsType(VALIDATION_SUITE.ATOMIC.boolean));
  it('Date', () => assertIsType(VALIDATION_SUITE.ATOMIC.date));
  it('enum (mixed values)', () => assertIsType(VALIDATION_SUITE.ATOMIC.enum_mixed));
  it('literal 2', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_2));
  it('literal "a"', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_a));
  it('literal /abc/i', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_simple));
  it('literal /[\'"]\\/ \\\\ \\//', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_escaped));
  it('literal true', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_true));
  it('literal 1n', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_1n));
  it('literal Symbol("hello")', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_symbol));
  it('never', () => assertIsType(VALIDATION_SUITE.ATOMIC.never));
  it('null', () => assertIsType(VALIDATION_SUITE.ATOMIC.null));
  it('number', () => assertIsType(VALIDATION_SUITE.ATOMIC.number));
  it('object', () => assertIsType(VALIDATION_SUITE.ATOMIC.object));
  it('RegExp', () => assertIsType(VALIDATION_SUITE.ATOMIC.regexp));
  it('string', () => assertIsType(VALIDATION_SUITE.ATOMIC.string));
  it('symbol', () => assertIsType(VALIDATION_SUITE.ATOMIC.symbol));
  it('undefined', () => assertIsType(VALIDATION_SUITE.ATOMIC.undefined));
  it('void', () => assertIsType(VALIDATION_SUITE.ATOMIC.void));

  // noLiterals variants — literal types degrade to their base kind.
  it('literal 2 (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_2_noLiterals));
  it('literal "a" (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_a_noLiterals));
  it('literal /abc/i (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_regexp_noLiterals));
  it('literal true (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_true_noLiterals));
  it('literal 1n (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_1n_noLiterals));
  it('literal Symbol("hello") (noLiterals)', () => assertIsType(VALIDATION_SUITE.ATOMIC.literal_symbol_noLiterals));

  // Coverage guard. Mirrors 01JsonAtomic.spec.ts's final
  // `it('all test ran', …)`. Fails if the suite gains a new atomic
  // case without a matching `it(...)` line above. Using a runtime
  // counter (not a key-set comparison) means filtered runs (--testNamePattern)
  // will skip this guard alongside the filtered tests; full runs catch drift.
  it('all atomic isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(VALIDATION_SUITE.ATOMIC).length);
  });
});

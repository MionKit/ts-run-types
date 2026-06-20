// Fixture for the object-shaped function families the validation / serialization
// suites don't exercise standalone: the unknown-keys group (hasUnknownKeys /
// stripUnknownKeys / unknownKeyErrors / unknownKeysToUndefined) and
// formatTransform. A unique branded type per family declares its override at
// module scope; `registerObjectFnsCase` registers the it()s (called from the
// single suite runner, overrides.test.ts). These families don't fit the
// OverrideCase shape (distinct signatures), so they live in their own registrar.

import {it, expect} from 'vitest';
import {
  createHasUnknownKeys,
  overrideHasUnknownKeys,
  createStripUnknownKeys,
  overrideStripUnknownKeys,
  createUnknownKeyErrors,
  overrideUnknownKeyErrors,
  createUnknownKeysToUndefined,
  overrideUnknownKeysToUndefined,
  createFormatTransform,
  overrideFormatTransform,
} from 'ts-runtypes';

type HukTarget = {readonly __brand: 'hukOverride'; a: number};
overrideHasUnknownKeys<HukTarget>((v) => (v as {x?: number}).x === 1);

type SukTarget = {readonly __brand: 'sukOverride'; a: number};
overrideStripUnknownKeys<SukTarget>(() => ({stripped: true}));

type UkeTarget = {readonly __brand: 'ukeOverride'; a: number};
overrideUnknownKeyErrors<UkeTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});

type UkuTarget = {readonly __brand: 'ukuOverride'; a: number};
overrideUnknownKeysToUndefined<UkuTarget>(() => ({u: undefined}));

type FmtTarget = {readonly __brand: 'fmtOverride'; a: number};
overrideFormatTransform<FmtTarget>(() => ({fmt: true}) as never);

/** Registers the five object-family it()s (call inside a describe). */
export function registerObjectFnsCase(): void {
  it('ObjectFns — hasUnknownKeys', () => {
    const huk = createHasUnknownKeys<HukTarget>();
    expect(huk({x: 1} as never)).toBe(true);
    expect(huk({x: 2} as never)).toBe(false);
  });

  it('ObjectFns — stripUnknownKeys', () => {
    const out = createStripUnknownKeys<SukTarget>()({a: 1} as never) as {stripped?: boolean};
    expect(out.stripped).toBe(true);
  });

  it('ObjectFns — unknownKeyErrors', () => {
    const errors = createUnknownKeyErrors<UkeTarget>()({a: 1} as never);
    expect(errors).toHaveLength(1);
    expect((errors[0] as {expected?: string}).expected).toBe('override');
  });

  it('ObjectFns — unknownKeysToUndefined', () => {
    const out = createUnknownKeysToUndefined<UkuTarget>()({a: 1} as never) as object;
    expect('u' in out).toBe(true);
  });

  it('ObjectFns — formatTransform', () => {
    const out = createFormatTransform<FmtTarget>()({a: 1} as never) as {fmt?: boolean};
    expect(out.fmt).toBe(true);
  });
}

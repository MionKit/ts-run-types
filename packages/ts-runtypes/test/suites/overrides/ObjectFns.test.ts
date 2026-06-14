// Override coverage for the object-shaped function families the validation /
// serialization suites don't exercise standalone: the unknown-keys group
// (hasUnknownKeys / stripUnknownKeys / unknownKeyErrors / unknownKeysToUndefined)
// and formatTransform. Self-contained, real TypeScript through the plugin: a
// unique branded type per family declares its override at module scope, and each
// it() calls the public factory and asserts the override's custom output.

import {describe, it, expect} from 'vitest';
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

describe('overrides / ObjectFns', () => {
  it('hasUnknownKeys', () => {
    const huk = createHasUnknownKeys<HukTarget>();
    expect(huk({x: 1} as never)).toBe(true);
    expect(huk({x: 2} as never)).toBe(false);
  });

  it('stripUnknownKeys', () => {
    const out = createStripUnknownKeys<SukTarget>()({a: 1} as never) as {stripped?: boolean};
    expect(out.stripped).toBe(true);
  });

  it('unknownKeyErrors', () => {
    const errors = createUnknownKeyErrors<UkeTarget>()({a: 1} as never);
    expect(errors).toHaveLength(1);
    expect((errors[0] as {expected?: string}).expected).toBe('override');
  });

  it('unknownKeysToUndefined', () => {
    const out = createUnknownKeysToUndefined<UkuTarget>()({a: 1} as never) as object;
    expect('u' in out).toBe(true);
  });

  it('formatTransform', () => {
    const out = createFormatTransform<FmtTarget>()({a: 1} as never) as {fmt?: boolean};
    expect(out.fmt).toBe(true);
  });
});

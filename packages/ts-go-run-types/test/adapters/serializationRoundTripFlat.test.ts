// Round-trip smoke tests for the OPTIMISED `*Flat` JSON serialiser
// family. The non-flat round-trip suite in serializationRoundTrip.test.ts
// already covers the breadth of the SERIALIZATION_SPEC; this file
// pins down the wire-shape changes specific to the flat family at union
// boundaries — for representative shapes we assert:
//
//   - prepareForJsonFlat(v) → JSON.stringify → JSON.parse → restoreFromJsonFlat(v)
//     ≅ v  (full unsafe round-trip)
//   - stringifyJsonFlat(v) → JSON.parse → restoreFromJsonFlat(v)
//     ≅ v  (single-pass safe round-trip)
//   - For mixed (atomic + object) unions, both branches produce the same
//     decoded shape across encoder choice.
//
// Marker rule: every JIT-touching test must cover BOTH the static
// `getRuntypeId<T>()` and the reflection `reflectRuntypeId(value)`
// forms. Each scenario below pairs two `it()` blocks accordingly.

import {describe, expect, it} from 'vitest';
import {createPrepareForJsonFlat, createRestoreFromJsonFlat, createStringifyJsonFlat} from '@mionjs/ts-go-run-types';

interface AlphaShape {
  kind: 'alpha';
  count: bigint;
  when: Date;
}

interface BetaShape {
  kind: 'beta';
  label: string;
  scale: number;
}

type ObjectUnion = AlphaShape | BetaShape;
type MixedUnion = string | AlphaShape;

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map(deepClone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value)) {
    out[k] = deepClone((value as Record<string, unknown>)[k]);
  }
  return out as T;
}

function unsafeRoundTrip(value: unknown, prepare: (v: unknown) => unknown, restore: (v: unknown) => unknown): unknown {
  // prepareForJson mutates v in place; JSON.stringify then handles Date via
  // its toJSON() contract. Same shape as the non-flat round-trip suite.
  const prepared = prepare(value);
  const parsed = JSON.parse(JSON.stringify(prepared));
  return restore(parsed);
}

function safeRoundTrip(value: unknown, stringify: (v: unknown) => string | undefined, restore: (v: unknown) => unknown): unknown {
  const serialised = stringify(value);
  if (serialised === undefined) return undefined;
  return restore(JSON.parse(serialised));
}

describe('serialization-flat / OBJECT UNION', () => {
  const alpha: AlphaShape = {kind: 'alpha', count: 42n, when: new Date('2024-01-15T12:00:00.000Z')};
  const beta: BetaShape = {kind: 'beta', label: 'pi', scale: 3.14};

  it('unsafe round-trip via getRuntypeId<ObjectUnion>()', () => {
    const prepare = createPrepareForJsonFlat<ObjectUnion>();
    const restore = createRestoreFromJsonFlat<ObjectUnion>();
    const restoredAlpha = unsafeRoundTrip(deepClone(alpha), prepare, restore);
    const restoredBeta = unsafeRoundTrip(deepClone(beta), prepare, restore);
    expect(restoredAlpha).toEqual(alpha);
    expect(restoredBeta).toEqual(beta);
  });

  it('safe round-trip via reflectRuntypeId(value)', () => {
    const sampleAlpha: ObjectUnion = alpha;
    const sampleBeta: ObjectUnion = beta;
    const stringifyAlpha = createStringifyJsonFlat(sampleAlpha);
    const stringifyBeta = createStringifyJsonFlat(sampleBeta);
    const restore = createRestoreFromJsonFlat(sampleAlpha);
    expect(safeRoundTrip(deepClone(alpha), stringifyAlpha, restore)).toEqual(alpha);
    expect(safeRoundTrip(deepClone(beta), stringifyBeta, restore)).toEqual(beta);
  });

  it('wire shape — encoder emits [-1, mergedObject] for object members', () => {
    const stringify = createStringifyJsonFlat<ObjectUnion>();
    const out = stringify(alpha) ?? '';
    // `[-1,...]` envelope confirms the optimised flat encoding kicked in.
    expect(out.startsWith('[-1,')).toBe(true);
  });
});

describe('serialization-flat / MIXED UNION (atomic + object)', () => {
  const alpha: AlphaShape = {kind: 'alpha', count: 7n, when: new Date('2025-05-15T00:00:00.000Z')};

  it('unsafe round-trip via getRuntypeId<MixedUnion>()', () => {
    const prepare = createPrepareForJsonFlat<MixedUnion>();
    const restore = createRestoreFromJsonFlat<MixedUnion>();
    const restoredString = unsafeRoundTrip('hello' as unknown, prepare, restore);
    const restoredObj = unsafeRoundTrip(deepClone(alpha), prepare, restore);
    expect(restoredString).toBe('hello');
    expect(restoredObj).toEqual(alpha);
  });

  it('safe round-trip via reflectRuntypeId(value)', () => {
    const sampleStr: MixedUnion = 'world';
    const sampleObj: MixedUnion = alpha;
    const stringifyStr = createStringifyJsonFlat(sampleStr);
    const stringifyObj = createStringifyJsonFlat(sampleObj);
    const restore = createRestoreFromJsonFlat(sampleObj);
    expect(safeRoundTrip('world' as unknown, stringifyStr, restore)).toBe('world');
    expect(safeRoundTrip(deepClone(alpha), stringifyObj, restore)).toEqual(alpha);
  });

  it('wire shape — atomic string member passes through unwrapped, object member uses [-1, …]', () => {
    const stringify = createStringifyJsonFlat<MixedUnion>();
    const strOut = stringify('hello') ?? '';
    const objOut = stringify(alpha) ?? '';
    // String is noop on both halves — the flat encoder skips the tuple.
    expect(strOut).toBe('"hello"');
    // Object member uses the flat envelope.
    expect(objOut.startsWith('[-1,')).toBe(true);
  });
});

// `getRunType` — the value-bearing twin of `getRunTypeId`. Verifies BOTH call
// shapes (static `getRunType<T>()` AND reflection `getRunType(value)`) resolve to
// the same registered RunType node, that the node is actually traversable, and
// that the runtime backstops throw when the transformer didn't inject an id.
// (Marker coverage rule: every marker test exercises both call shapes, and at
// least one asserts the two forms converge on the same entry.)

import {describe, it, expect} from 'vitest';
import {getRunType, getRunTypeId, getRTUtils, RunTypeKind, type InjectRunTypeId, type RunType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import * as TF from '@ts-runtypes/core/formats';

describe('getRunType — reflected RunType node accessor', () => {
  it('(static) returns the traversable node for T', () => {
    const runType = getRunType<{id: number; name: string}>();
    expect(typeof runType.id).toBe('string');
    expect(runType.kind).toBe(RunTypeKind.objectLiteral);
    // the node carries its properties — walk them
    const props = (runType.children ?? []).map((child) => child.name);
    expect(props).toEqual(['id', 'name']);
  });

  it('(reflect) infers T from a value and returns the SAME node as the static form', () => {
    const value = {id: 1, name: 'Ada'};
    const fromValue = getRunType(value);
    const fromType = getRunType<{id: number; name: string}>();
    // one shared singleton per structural id — both forms land on it
    expect(fromValue.id).toBe(fromType.id);
    expect(fromValue).toBe(fromType);
  });

  it('(schema, value-first) reflects the type the schema MODELS, converging with the type form', () => {
    // Regression: without the `getRunType(schema: RunType<T>)` overload, a
    // value-first `getRunType(RT.object({…}))` inferred `T = RunType<…>` and
    // reflected the whole RunType wrapper interface (id, kind, children, format
    // annotation, …) instead of the type the schema models.
    const schema = RT.object({id: TF.number(), name: TF.string()});
    const fromSchema = getRunType(schema);
    const fromType = getRunType<{id: number; name: string}>();
    expect(fromSchema.kind).toBe(RunTypeKind.objectLiteral);
    expect((fromSchema.children ?? []).map((child) => child.name)).toEqual(['id', 'name']);
    // Same registered singleton as the type-first form — the modeled type, not
    // the RunType wrapper.
    expect(fromSchema).toBe(fromType);
  });

  it('(schema) getRunTypeId returns the MODELED type id, converging with the type form', () => {
    const schema = RT.object({id: TF.number(), name: TF.string()});
    const schemaId = getRunTypeId(schema);
    const typeId = getRunTypeId<{id: number; name: string}>();
    expect(schemaId).toBe(typeId);
  });

  it('resolves to the same id getRunTypeId returns (static + reflect)', () => {
    const value = {id: 1, name: 'Ada'};
    const expected = getRunTypeId<{id: number; name: string}>();
    const staticNode = getRunType<{id: number; name: string}>();
    const reflectNode = getRunType(value);
    expect(staticNode.id).toBe(expected);
    expect(reflectNode.id).toBe(expected);
  });

  it('throws when the transformer is inactive (no id injected)', () => {
    const erased = getRunType as (...args: unknown[]) => unknown;
    expect(() => erased()).toThrow(/no id injected/);
  });

  it('throws when the injected id has no registered entry', () => {
    const erased = getRunType as (...args: unknown[]) => unknown;
    expect(() => erased(undefined, 'getRunType-nonexistent-id')).toThrow(/no RunType entry/);
  });
});

// Regression for docs/done/inject-runtypeid-helper-getruntype-undefined.md: the
// documented wrapper pattern. A helper declares a trailing
// `id?: InjectRunTypeId<T>`; the build injects an opaque handle at each concrete
// call site; the body resolves it by FORWARDING it to a public resolver as the
// trailing argument (`getRunType<T>(undefined, id)`). The forwarded call is a
// pass-through the build leaves untouched (no MKR003), and it resolves to the
// exact same registered node/id as direct reflection. The raw handle is NOT a
// string, so the old `getRTUtils().getRunType(id)` path missed — that is why
// forwarding is required.
describe('getRunType — user wrapper forwarding an injected handle', () => {
  function reflectType<T>(id?: InjectRunTypeId<T>): RunType<T> {
    return getRunType<T>(undefined, id);
  }
  function idOfType<T>(id?: InjectRunTypeId<T>): string {
    return getRunTypeId<T>(undefined, id);
  }
  function idOfValue<T>(_value: T, id?: InjectRunTypeId<T>): string {
    return getRunTypeId<T>(undefined, id);
  }

  it('(static wrapper) resolves the handle to the SAME node as direct getRunType<T>()', () => {
    const wrapped = reflectType<{id: number; name: string}>();
    const direct = getRunType<{id: number; name: string}>();
    expect(wrapped.kind).toBe(RunTypeKind.objectLiteral);
    expect(wrapped).toBe(direct); // one shared registered singleton
  });

  it('(static wrapper) resolves the handle to the same id as direct getRunTypeId<T>()', () => {
    const wrappedId = idOfType<{id: number; name: string}>();
    const directId = getRunTypeId<{id: number; name: string}>();
    expect(wrappedId).toBe(directId);
  });

  it('(value-first wrapper) resolves the handle from an inferred T', () => {
    const value = {id: 1, name: 'Ada'};
    const wrappedId = idOfValue(value);
    const directId = getRunTypeId<{id: number; name: string}>();
    expect(wrappedId).toBe(directId);
  });

  it('the raw injected handle is NOT a plain string, so getRTUtils().getRunType(handle) misses', () => {
    // Capture the raw handle WITHOUT forwarding it — the mistake the old guide made.
    let raw: unknown;
    function capture<T>(id?: InjectRunTypeId<T>): void {
      raw = id;
    }
    capture<{id: number; name: string}>();
    // The injected value is the entry-module tuple (an array), not a hash string.
    expect(typeof raw).not.toBe('string');
    expect(Array.isArray(raw)).toBe(true);
    // Indexing the string-keyed registry with it therefore returns undefined —
    // the exact symptom the todo tracked. Forwarding (above) is the fix.
    expect(getRTUtils().getRunType(raw as unknown as string)).toBeUndefined();
  });
});

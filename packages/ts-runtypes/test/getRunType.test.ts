// `getRunType` — the value-bearing twin of `getRunTypeId`. Verifies BOTH call
// shapes (static `getRunType<T>()` AND reflection `getRunType(value)`) resolve to
// the same registered RunType node, that the node is actually traversable, and
// that the runtime backstops throw when the transformer didn't inject an id.
// (Marker coverage rule: every marker test exercises both call shapes, and at
// least one asserts the two forms converge on the same entry.)

import {describe, it, expect} from 'vitest';
import {getRunType, getRunTypeId, RunTypeKind} from 'ts-runtypes';

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

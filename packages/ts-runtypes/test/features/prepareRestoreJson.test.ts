// End-to-end acceptance test for the value-level JSON transform pair
// createPrepareForJson<T> / createRestoreFromJson<T>. Drives the full vite-plugin
// pipeline: the plugin injects the 'pj' / 'rj' entry tuples at each call site,
// and at runtime the factories resolve the compiled value transforms.
//
// `prepare` maps a typed value to a JSON-safe value; `restore` maps it back.
// The point of the pair is a value-level round-trip WITHOUT a string hop, so a
// framework that owns its own JSON envelope (mion parses one envelope per
// request) applies them directly.
//
// Per the CLAUDE.md marker-coverage rule both call shapes are exercised — the
// static `createPrepareForJson<T>()` form and the value-first
// `createPrepareForJson(value)` form.

import {describe, test, expect} from 'vitest';
import {createPrepareForJson, createRestoreFromJson} from '@ts-runtypes/core';

type Payload = {id: bigint; when: Date; name: string};

describe('createPrepareForJson / createRestoreFromJson — value-level JSON round-trip', () => {
  test('static form round-trips a bigint + Date payload through prepare/stringify/parse/restore', () => {
    const prepare = createPrepareForJson<Payload>();
    const restore = createRestoreFromJson<Payload>();

    const value: Payload = {id: 42n, when: new Date('2020-01-02T03:04:05.000Z'), name: 'ada'};
    // prepare produces a JSON-safe value (bigint -> string; Date kept, then
    // serialized by JSON.stringify via toJSON).
    const wire = JSON.stringify(prepare(value));
    const restored = restore(JSON.parse(wire)) as Payload;

    expect(restored.id).toBe(42n);
    expect(restored.when instanceof Date).toBe(true);
    expect(restored.when.getTime()).toBe(new Date('2020-01-02T03:04:05.000Z').getTime());
    expect(restored.name).toBe('ada');
  });

  test('value-first form resolves the same transforms', () => {
    const seed: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob'};
    const prepare = createPrepareForJson(seed);
    const restore = createRestoreFromJson(seed);

    const value: Payload = {id: 7n, when: new Date('2021-05-06T07:08:09.000Z'), name: 'bob'};
    const restored = restore(JSON.parse(JSON.stringify(prepare(value)))) as Payload;
    expect(restored.id).toBe(7n);
    expect(restored.when.getTime()).toBe(value.when.getTime());
    expect(restored.name).toBe('bob');
  });

  test('a root undefined / void does not throw — the caller owns the envelope', () => {
    const prepareVoid = createPrepareForJson<undefined>();
    const restoreVoid = createRestoreFromJson<undefined>();

    // prepare passes undefined through; the value-level factory never throws.
    expect(prepareVoid(undefined)).toBeUndefined();
    // undefined inside the caller's own array envelope stringifies to null, and
    // restore maps any input back to undefined — the round-trip holds.
    const wire = JSON.stringify([prepareVoid(undefined)]);
    expect(wire).toBe('[null]');
    expect(restoreVoid(JSON.parse(wire)[0])).toBeUndefined();
  });
});

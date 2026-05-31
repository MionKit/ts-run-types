// Decoder-safe-mode integration tests for ukuWire.
//
// The safe decoder composes:
//
//   decode(s) → restore(uku(JSON.parse(s)))
//
// where `uku` is actually the ukuWire RT family (the public uku is a
// no-op on unions because the same factory hash is shared with the
// public createUnknownKeysToUndefined API which operates on raw
// objects).
//
// For unions, the parsed wire value is `[-1, mergedObject]` (object
// branch) or `[idx, value]` (atomic branch with tuple wrap). ukuWire
// detects the wrapper at runtime and reaches into `v[1]` to apply the
// merged-allowlist strip on the merged-object branch — closing the
// decoder-safety hole at union nodes that the legacy uku-no-op-on-
// union created.
//
// These tests craft unsafe-encoded wire payloads and assert that the
// safe decoder nukes undeclared keys before returning.

import {describe, expect, it} from 'vitest';
import {createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';

describe('safe decoder — ukuWire strips undeclared keys at union nodes', () => {
  type Disjoint = {a: string} | {b: number};

  it('strips undeclared keys from an unsafe-encoded union payload', () => {
    // Hand-craft a wire string that an unsafe encoder might produce —
    // [-1, mergedObject] with an extra key smuggled into the merged
    // object branch. The safe decoder must strip the extra before
    // returning.
    const wire = JSON.stringify([-1, {a: 'hi', evil: 'sneaky'}]);
    const decode = createJsonDecoder<Disjoint>();
    const restored = decode(wire);
    expect((restored as Record<string, unknown>).a).toBe('hi');
    expect((restored as Record<string, unknown>).evil).toBeUndefined();
  });

  it('round-trips correctly when both halves use safe mode', () => {
    // Sanity: the safe encoder strips extras by construction, so the
    // safe decoder pipeline shouldn't see them — happy path still
    // works.
    const encode = createJsonEncoder<Disjoint>();
    const decode = createJsonDecoder<Disjoint>();
    const value: Disjoint = {a: 'hello'};
    const wire = encode(value)!;
    const back = decode(wire);
    expect(back).toEqual({a: 'hello'});
  });

  it('unsafe encoder → safe decoder strips extras', () => {
    // Unsafe encoder lets extras through; safe decoder must nuke
    // them at union arms. Without ukuWire, the extras would survive.
    const unsafeEncode = createJsonEncoder<Disjoint>(undefined, {strategy: 'mutate'});
    const decode = createJsonDecoder<Disjoint>();
    const dirty = {a: 'hello', stranger: 'bad'} as Disjoint;
    const wire = unsafeEncode(dirty)!;
    const back = decode(wire);
    expect((back as Record<string, unknown>).a).toBe('hello');
    expect((back as Record<string, unknown>).stranger).toBeUndefined();
  });

  it('atomic-only union: ukuWire is identity on raw atomic wire', () => {
    // For `string | number`, AtomicNeedsTuple=false at emit time:
    // every member is JSON-natural so the wire has NO wrapper. The
    // decoder must work identity-style on raw atomics — no wrapper
    // peel attempted.
    const decode = createJsonDecoder<string | number>();
    expect(decode('"hi"')).toBe('hi');
    expect(decode('42')).toBe(42);
  });
});

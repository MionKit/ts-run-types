// Ports the three ad-hoc noop-marker tests from
// `mion/packages/run-types/src/rtCompilers/json/jsonSpec/00JsonOnly.spec.ts`.
//
// Verifies the renderer's treatment of trivially JSON-safe shapes, which is
// now STRONGER than mion's `isNoop: true` marker: the noop verdict is decided
// semantically over the type graph (typefns/noop_types.go), and the JSON
// composites ELIDE identity primitives outright — no binding, no import, no
// module load. So where mion asserts `entry.isNoop === true`, our runtime
// cache simply never receives the pj/rj entry for a noop shape (the jeMU/jdST
// composite collapses to bare `JSON.stringify(v)` / `rjOrUkuw(JSON.parse(s))`
// with the dead half gone). Shapes that DO need a transform keep their
// primitive entries, registered with isNoop=false.
//
// The entry lookups filter on `familyTag` (the tuple's exact emitting family)
// rather than `fnID`: composites HOST on the primitive's fnID (`jeMU` carries
// fnID 'pj'), so an fnID scan would match the composite once the primitive
// stops loading — the exact ambiguity that masked this contract before.

import {describe, expect, it} from 'vitest';
import {createJsonDecoder, createJsonEncoder, getRTFnCaches, getRunTypeId} from 'ts-runtypes';

interface NoJsonENCDECRequired {
  a: number;
  b: string;
}
interface SonENCDECRequired {
  a: bigint;
  c: Date;
}

type TupleNoJsonENCDECRequired = [number, string];
type TupleSonENCDECRequired = [bigint, Date];

type AtomicNoEncRequired = number | string;
type AtomicEncRequired = bigint | Date;

// Cache keys are `<fnHash>_<id>` (opaque per-family hash) with no runtime
// hashing to reconstruct the prefix — find the entry by its exact emitting
// familyTag plus the `_<id>` suffix (the id stays f(T)).
function entryByFamily(familyTag: string, id: string) {
  const {rtFnsCache} = getRTFnCaches();
  const suffix = '_' + id;
  for (const key of Object.keys(rtFnsCache)) {
    const entry = rtFnsCache[key];
    if (entry?.familyTag === familyTag && key.endsWith(suffix)) return entry;
  }
  return undefined;
}
function pjEntry(id: string) {
  return entryByFamily('pj', id);
}
function rjEntry(id: string) {
  return entryByFamily('rj', id);
}

// pj / rj are demand-scoped: each `T` inspected below must also be passed to
// the matching JSON factory at a call site the scanner can see —
// createJsonEncoder(mutate) demands `pj`, createJsonDecoder (default strip)
// demands `rj`. Whether the demanded primitive then LOADS at runtime depends
// on the composite keeping its binding — that's the contract under test.
describe('json noop markers (00JsonOnly.spec.ts port)', () => {
  it('interface json encode/decode should be marked as noop when there are no actions required', () => {
    const noopId = getRunTypeId<NoJsonENCDECRequired>();
    const encId = getRunTypeId<SonENCDECRequired>();
    createJsonEncoder<NoJsonENCDECRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<NoJsonENCDECRequired>();
    createJsonEncoder<SonENCDECRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<SonENCDECRequired>();

    // Noop shapes: the composites elided their pj/rj bindings, so the
    // primitive entries never load — stronger than mion's isNoop flag.
    expect(pjEntry(noopId)).toBeUndefined();
    expect(rjEntry(noopId)).toBeUndefined();
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });

  it('tuple json encode/decode should be marked as noop when there are no actions required', () => {
    const noopId = getRunTypeId<TupleNoJsonENCDECRequired>();
    const encId = getRunTypeId<TupleSonENCDECRequired>();
    createJsonEncoder<TupleNoJsonENCDECRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<TupleNoJsonENCDECRequired>();
    createJsonEncoder<TupleSonENCDECRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<TupleSonENCDECRequired>();

    expect(pjEntry(noopId)).toBeUndefined();
    expect(rjEntry(noopId)).toBeUndefined();
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });

  it('atomic union — pj keeps the dispatch, rj collapses when no member needs the wrap', () => {
    // Per mion's per-member `skipEncode + needsTupleEncoding` optimisation
    // (rtCompilers/json/stringifyJson.ts:295-306), a union member skips
    // the `[memberIndex, value]` envelope when BOTH its prepareForJson
    // and restoreFromJson would compile to noop. For `number | string`,
    // every member is noop on both halves, so:
    //   - prepareForJson keeps the if/else dispatch (with the trailing
    //     throw on unmatched inputs) — the dispatch survives so the pj
    //     entry stays live with isNoop=false.
    //   - restoreFromJson has nothing to decode (no member is wrapped),
    //     so the rj side is identity → the decoder composite elides it
    //     and the entry never loads.
    // For `bigint | Date`, both members are non-noop on at least one
    // half (bigint pj/rj are non-noop, Date rj is non-noop), so the
    // wrap is preserved on every member and both halves stay live.
    const noopId = getRunTypeId<AtomicNoEncRequired>();
    const encId = getRunTypeId<AtomicEncRequired>();
    createJsonEncoder<AtomicNoEncRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<AtomicNoEncRequired>();
    createJsonEncoder<AtomicEncRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<AtomicEncRequired>();

    expect(pjEntry(noopId)?.isNoop).toBe(false);
    expect(rjEntry(noopId)).toBeUndefined();
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });
});

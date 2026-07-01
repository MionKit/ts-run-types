// Ports the three ad-hoc noop-marker tests from
// `00JsonOnly.spec.ts` (ref: packages/run-types/src/rtCompilers/json/jsonSpec/).
//
// Verifies the renderer's treatment of trivially JSON-safe shapes, which is
// now STRONGER than the `isNoop: true` marker: the noop verdict is decided
// semantically over the type graph (typefns/noop_types.go), and the JSON
// composites ELIDE identity primitives outright — no binding, no import, no
// module load. So where the reference asserts `entry.isNoop === true`, our runtime
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
    // primitive entries never load — stronger than the isNoop flag.
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

  it('atomic union — pj AND rj both collapse when no member needs the wrap', () => {
    // A union whose members are all JSON-identity round-trips raw (no
    // `[memberIndex, value]` envelope). For `number | string`, every member is
    // noop on both halves, so the encoders collapse to a straight pass-through
    // (atomicOnlyJsonIdentity — union_flat_layout.go), symmetric with the decode
    // side which already short-circuits to identity:
    //   - prepareForJson is identity → the pj entry is elided (no dispatch, no
    //     trailing throw). (Previously it kept the validate-and-return-unchanged
    //     dispatch — the finding-B asymmetry, now removed.)
    //   - restoreFromJson has nothing to decode → the rj side is identity → the
    //     decoder composite elides it and the entry never loads.
    // For `bigint | Date`, both members are non-noop on at least one half (bigint
    // pj/rj are non-noop, Date rj is non-noop), so the wrap is preserved on every
    // member and both halves stay live.
    const noopId = getRunTypeId<AtomicNoEncRequired>();
    const encId = getRunTypeId<AtomicEncRequired>();
    createJsonEncoder<AtomicNoEncRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<AtomicNoEncRequired>();
    createJsonEncoder<AtomicEncRequired>(undefined, {strategy: 'mutate'});
    createJsonDecoder<AtomicEncRequired>();

    expect(pjEntry(noopId)).toBeUndefined();
    expect(rjEntry(noopId)).toBeUndefined();
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });
});

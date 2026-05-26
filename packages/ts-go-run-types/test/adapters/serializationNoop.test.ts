// Ports the three ad-hoc noop-marker tests from
// `mion/packages/run-types/src/jitCompilers/json/jsonSpec/00JsonOnly.spec.ts`.
//
// Verifies that the renderer marks trivially JSON-safe shapes as
// `isNoop: true` on the cache entry — empty interfaces with only
// number/string props, tuples of those props, etc. — so consumers
// can skip the round-trip altogether.
//
// CROSS-CUTTING NOTE — divergence from mion:
//
// Our `PrepareForJsonEmitter.Finalize` (json_prepare.go:716) always
// returns `isNoop: false` regardless of whether the body collapses to
// `return v`. Reason: the Go renderer skips emitting the factory line
// entirely when isNoop=true (module.go:229), so any parent calling
// `<childHash>.fn(v[i])` would hit a missing entry. To keep dep-call
// chains intact we always emit an identity factory.
//
// Consequence for these tests:
//   - mion's `createJitCompiledFunction(...).isNoop === true`
//     becomes our `jitFnsCache['pj_<id>'].isNoop === false`.
//   - For atomic kinds where no factory is emitted (string, number,
//     bigint, etc. — Finalize returns "" and the renderer skips the
//     init line), the cache entry simply doesn't exist; mion's
//     equivalent has the entry but with isNoop=true.
//
// The tests below assert mion's semantics — when they fail, the
// failure surfaces the divergence visibly per the testing rules.

import {describe, expect, it} from 'vitest';
import {getJitFnCaches, getRuntypeId} from '@mionjs/ts-go-run-types';

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

function pjEntry(id: string) {
  const {jitFnsCache} = getJitFnCaches();
  return jitFnsCache['pj_' + id];
}
function rjEntry(id: string) {
  const {jitFnsCache} = getJitFnCaches();
  return jitFnsCache['rj_' + id];
}

describe('json noop markers (00JsonOnly.spec.ts port)', () => {
  it('interface json encode/decode should be marked as noop when there are no actions required', () => {
    const noopId = getRuntypeId<NoJsonENCDECRequired>();
    const encId = getRuntypeId<SonENCDECRequired>();

    expect(pjEntry(noopId)?.isNoop).toBe(true);
    expect(rjEntry(noopId)?.isNoop).toBe(true);
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });

  it('tuple json encode/decode should be marked as noop when there are no actions required', () => {
    const noopId = getRuntypeId<TupleNoJsonENCDECRequired>();
    const encId = getRuntypeId<TupleSonENCDECRequired>();

    expect(pjEntry(noopId)?.isNoop).toBe(true);
    expect(rjEntry(noopId)?.isNoop).toBe(true);
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });

  it('atomic union — pj keeps the dispatch, rj collapses when no member needs the wrap', () => {
    // Per mion's per-member `skipEncode + needsTupleEncoding` optimisation
    // (jitCompilers/json/stringifyJson.ts:295-306), a union member skips
    // the `[memberIndex, value]` envelope when BOTH its prepareForJson
    // and restoreFromJson would compile to noop. For `number | string`,
    // every member is noop on both halves, so:
    //   - prepareForJson keeps the if/else dispatch (with the trailing
    //     throw on unmatched inputs) — the dispatch survives so isNoop
    //     stays false on pj.
    //   - restoreFromJson has nothing to decode (no member is wrapped),
    //     so the whole body collapses to identity → isNoop=true on rj.
    // For `bigint | Date`, both members are non-noop on at least one
    // half (bigint pj/rj are non-noop, Date rj is non-noop), so the
    // wrap is preserved on every member and both halves stay non-noop.
    const noopId = getRuntypeId<AtomicNoEncRequired>();
    const encId = getRuntypeId<AtomicEncRequired>();

    expect(pjEntry(noopId)?.isNoop).toBe(false);
    expect(rjEntry(noopId)?.isNoop).toBe(true);
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });
});

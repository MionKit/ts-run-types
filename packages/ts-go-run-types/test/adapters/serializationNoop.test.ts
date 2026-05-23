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
// Our `PrepareForJsonEmitter.Finalize` (preparefjson.go:716) always
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

  it('json encode/decode should never be marked as noop as encoding/decoding is always required', () => {
    const noopId = getRuntypeId<AtomicNoEncRequired>();
    const encId = getRuntypeId<AtomicEncRequired>();

    expect(pjEntry(noopId)?.isNoop).toBe(false);
    expect(rjEntry(noopId)?.isNoop).toBe(false);
    expect(pjEntry(encId)?.isNoop).toBe(false);
    expect(rjEntry(encId)?.isNoop).toBe(false);
  });
});

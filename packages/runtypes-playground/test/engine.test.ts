import {beforeAll, describe, expect, it} from 'vitest';
import {run, setResolver, versions} from '../src/core/index.ts';
import {assetsBuilt, loadNodeResolver} from './nodeResolver.ts';

// End-to-end engine tests: each resolves <factory><MyType>() via the real WASM
// resolver, links the emitted entry modules in-process, hands the tuple to the
// public ts-runtypes factory, and runs the live function - the same pipeline the
// browser playground drives. They need the built WASM assets; run
//   pnpm --filter runtypes-playground run build:wasm
// first (the website/playground build does this). Without the assets, they skip.

const TYPE = `type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`;

const VALID = {id: 1, name: 'ada', tags: ['math', 'code'], active: true};
const INVALID = {id: 'not-a-number', name: 'ada', tags: []};

const ready = assetsBuilt();
if (!ready) {
  // eslint-disable-next-line no-console
  console.warn(
    '[runtypes-playground] WASM assets not built - skipping engine tests. Run: pnpm --filter runtypes-playground run build:wasm'
  );
}
const describeIf = ready ? describe : describe.skip;

describeIf('playground engine (WASM, live execution)', () => {
  beforeAll(async () => {
    setResolver(await loadNodeResolver());
  });

  it('reports the resolver versions', async () => {
    const v = await versions();
    expect(typeof v.version).toBe('string');
    expect(typeof v.tsgo).toBe('string');
  });

  it('createValidate accepts a matching value and rejects a mismatch', async () => {
    expect(await run('validate', TYPE, VALID)).toMatchObject({kind: 'predicate', value: true});
    expect(await run('validate', TYPE, INVALID)).toMatchObject({kind: 'predicate', value: false});
  });

  it('createGetValidationErrors reports errors only for a mismatch', async () => {
    const good = await run('errors', TYPE, VALID);
    const bad = await run('errors', TYPE, INVALID);
    if (good.kind !== 'errors' || bad.kind !== 'errors') throw new Error('expected errors result');
    expect(good.value).toHaveLength(0);
    expect(bad.value.length).toBeGreaterThan(0);
  });

  it('createJsonEncoder/Decoder round-trips a value', async () => {
    const res = await run('jsonDecoder', TYPE, VALID);
    if (res.kind !== 'jsonRoundtrip') throw new Error('expected jsonRoundtrip result');
    expect(res.decoded).toMatchObject({id: 1, name: 'ada'});
  });

  it('createBinaryEncoder/Decoder round-trips a value', async () => {
    const res = await run('binaryDecoder', TYPE, VALID);
    if (res.kind !== 'binaryRoundtrip') throw new Error('expected binaryRoundtrip result');
    expect(res.byteLength).toBeGreaterThan(0);
    expect(res.decoded).toMatchObject({id: 1, name: 'ada'});
  });

  it('getRunTypeId resolves the RunType graph', async () => {
    const res = await run('graph', TYPE);
    if (res.kind !== 'graph') throw new Error('expected graph result');
    expect(res.rootId).toBeTruthy();
    expect(res.runTypes.length).toBeGreaterThan(0);
  });
});

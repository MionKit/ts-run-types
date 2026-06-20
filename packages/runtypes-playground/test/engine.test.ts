import {beforeAll, describe, expect, it} from 'vitest';
import {generatedFunction, generatedModules, mock, mockInvalid, run, setResolver, versions} from '../src/core/index.ts';
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

  it('createMockType generates a value that validates', async () => {
    const m = await mock(TYPE);
    expect(m.value).toBeTypeOf('object');
    const ok = await run('validate', TYPE, m.value);
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
  });

  it('mockInvalid (negative generator) produces values that fail validation', async () => {
    for (let i = 0; i < 8; i++) {
      const m = await mockInvalid(TYPE);
      const res = await run('validate', TYPE, m.value);
      if (res.kind !== 'predicate') throw new Error('expected predicate result');
      expect(res.value).toBe(false);
    }
  });

  it('mockInvalid invalidLeafProbability biases leaf (1) vs root (0) corruption', async () => {
    // invalidLeafProbability=1 corrupts a deep leaf, so the root object survives.
    const leaf = await mockInvalid(TYPE, undefined, 'type', 1);
    expect(leaf.value).toBeTypeOf('object');
    const leafRes = await run('validate', TYPE, leaf.value);
    if (leafRes.kind !== 'predicate') throw new Error('expected predicate result');
    expect(leafRes.value).toBe(false);

    // invalidLeafProbability=0 replaces the whole root with a wrong-typed value.
    const root = await mockInvalid(TYPE, undefined, 'type', 0);
    expect(root.value).not.toBeTypeOf('object');
    const rootRes = await run('validate', TYPE, root.value);
    if (rootRes.kind !== 'predicate') throw new Error('expected predicate result');
    expect(rootRes.value).toBe(false);
  });

  it('mockInvalid works in the value-first schema form (mode: schema)', async () => {
    const schema = `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
      id: TF.number(),
      name: TF.string(),
      tags: RT.array(TF.string()),
      active: RT.boolean(),
    });`;
    const m = await mockInvalid(schema, undefined, 'schema');
    const res = await run('validate', schema, m.value, undefined, 'schema');
    if (res.kind !== 'predicate') throw new Error('expected predicate result');
    expect(res.value).toBe(false);
  });

  it('generated code is a single self-contained cache (nested types inlined)', async () => {
    const nested = `type MyType = { outer: { innerField: string; innerNum: number } };`;
    const m = await generatedFunction('createValidate', nested);
    // allInternal + allSingle inline the nested object into the one shown
    // function, so its inner fields appear in the single code slot rather than a
    // sibling module the view would miss.
    expect(m.code).toBeTruthy();
    expect(m.code).toContain('innerField');
    expect(m.code).toContain('innerNum');
  });

  it('generatedModules returns the generated code per family', async () => {
    const mods = await generatedModules(TYPE);
    expect(mods.map((m) => m.factory)).toContain('createValidate');
    const validate = mods.find((m) => m.factory === 'createValidate');
    expect(validate?.code).toContain('return');
  });

  it('handles a circular (recursive) type in both type and schema forms', async () => {
    const typeForm = `type MyType = { id: number; name: string; children: MyType[] };`;
    const schemaForm = `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';
const MyType = RT.circular((self) => RT.object({ id: TF.number(), name: TF.string(), children: RT.array(self) }));`;
    const tree = {id: 1, name: 'root', children: [{id: 2, name: 'leaf', children: []}]};
    const badNested = {id: 1, name: 'root', children: [{id: 'nope', name: 'leaf', children: []}]};

    for (const [code, mode] of [
      [typeForm, 'type'],
      [schemaForm, 'schema'],
    ] as const) {
      const graph = await run('graph', code, undefined, undefined, mode);
      if (graph.kind !== 'graph') throw new Error('expected graph result');
      expect(graph.runTypes.length).toBeGreaterThan(0);

      const ok = await run('validate', code, tree, undefined, mode);
      const ko = await run('validate', code, badNested, undefined, mode);
      if (ok.kind !== 'predicate' || ko.kind !== 'predicate') throw new Error('expected predicate result');
      expect(ok.value).toBe(true); // valid tree
      expect(ko.value).toBe(false); // recursion reaches the bad nested id
    }
  });

  it('runs the value-first schema form (mode: schema)', async () => {
    const schema = `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
      id: TF.number(),
      name: TF.string(),
      tags: RT.array(TF.string()),
      active: RT.boolean(),
    });`;
    const ok = await run('validate', schema, VALID, undefined, 'schema');
    if (ok.kind !== 'predicate') throw new Error('expected predicate result');
    expect(ok.value).toBe(true);
    const bad = await run('validate', schema, INVALID, undefined, 'schema');
    if (bad.kind !== 'predicate') throw new Error('expected predicate result');
    expect(bad.value).toBe(false);
  });
});

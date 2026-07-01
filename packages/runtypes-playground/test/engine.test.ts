import {beforeAll, describe, expect, it} from 'vitest';
import {
  factoryCall,
  factoryImport,
  generatedCache,
  mock,
  mockInvalid,
  run,
  setResolver,
  transformedSource,
  versions,
} from '../src/core/index.ts';
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

// The surrounding-code templating the type column shows around the user's type
// (header import + footer call). Pure string helpers - no resolver needed.
describe('surrounding-code templating', () => {
  it('factoryImport renders the ts-runtypes import line', () => {
    expect(factoryImport('createValidate')).toBe("import { createValidate } from 'ts-runtypes';");
    expect(factoryImport('createJsonEncoder')).toBe("import { createJsonEncoder } from 'ts-runtypes';");
  });

  it('factoryCall renders the type-first call, appending the injected arg when given', () => {
    expect(factoryCall('createValidate', 'validate', 'type')).toBe('const validate = createValidate<MyType>();');
    expect(factoryCall('createValidate', 'validate', 'type', '__rt_a1b_Xk7')).toBe(
      'const validate = createValidate<MyType>(__rt_a1b_Xk7);'
    );
  });

  it('factoryCall renders the value-first (schema) call, injecting after the schema', () => {
    expect(factoryCall('createValidate', 'validate', 'schema')).toBe('const validate = createValidate(MyType);');
    expect(factoryCall('createValidate', 'validate', 'schema', '__rt_a1b_Xk7')).toBe(
      'const validate = createValidate(MyType, __rt_a1b_Xk7);'
    );
  });
});

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

  it('getRunType resolves the RunType graph', async () => {
    const res = await run('graph', TYPE);
    if (res.kind !== 'graph') throw new Error('expected graph result');
    expect(res.rootId).toBeTruthy();
    expect(res.runTypes.length).toBeGreaterThan(0);
  });

  it('generatedCache returns the runtype cache module for getRunType', async () => {
    const mods = await generatedCache('getRunType', TYPE);
    // Reflection is a single runtype data bundle module (compact cache, not expanded JSON).
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toMatch(/^virtual:rt\/.+\.js$/);
    expect(mods[0].code).toMatch(/export const __rt_/);
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

  it('generated cache ships a live factory function (emit mode: functions), not a code string', async () => {
    const mods = await generatedCache('createValidate', TYPE);
    // A single function type = one named cache module.
    expect(mods).toHaveLength(1);
    expect(mods[0].name).toMatch(/^virtual:rt\/.+\.js$/);
    // The WASM resolver runs EmitFunctions (cmd/ts-runtypes-wasm/main.go), so the
    // factory rides as a real `function g_…(utl){…}` in the tuple, not an escaped
    // code string - clearer in the "Generated Cache" view.
    expect(mods[0].code).toMatch(/export const __rt_/);
    expect(mods[0].code).toMatch(/function g_[A-Za-z0-9_]+\(utl\)/);
  });

  it('generated cache returns one named module per family (codecs span several)', async () => {
    // A JSON codec's composite looks its primitives up at runtime, so the resolver
    // emits several sibling modules that import each other. The cache view keeps
    // them as separate named sections (each labeled with its `virtual:rt/…` name)
    // rather than a single blob.
    const mods = await generatedCache('createJsonDecoder', TYPE);
    expect(mods.length).toBeGreaterThan(1);
    for (const m of mods) {
      expect(m.name).toMatch(/^virtual:rt\/.+\.js$/);
      expect(m.code).toMatch(/export const __rt_/);
    }
  });

  it('generated cache inlines a NAMED nested type into one self-contained function', async () => {
    // Regression guard for the playground resolver's single-cache config
    // (cmd/ts-runtypes-wasm/main.go: InlineMode allInternal + ModuleMode allSingle).
    // A NAMED nested type is the discriminating case: under the resolver's DEFAULT
    // inline mode a named alias becomes a SEPARATE cache entry and the root validator
    // delegates to it (`...fn(v.outer)`), so the named member's leaf checks land in a
    // sibling module. allInternal inlines it into the one validate module. DO NOT
    // relax this to an unnamed `{ ... }` object — those inline under BOTH modes, so
    // the test would silently stop catching the regression.
    const named = `type Inner = { innerField: string; innerNum: number };
type MyType = { outer: Inner };`;
    const mods = await generatedCache('createValidate', named);
    // validate is a single family, so one module carrying the whole inlined function.
    expect(mods).toHaveLength(1);
    const code = mods[0].code;
    // The named member's leaf checks appear INLINE in the single cached function...
    expect(code).toContain('innerField');
    expect(code).toContain('innerNum');
    // ...and it is self-contained — no delegation to an external sibling entry.
    expect(code).not.toMatch(/\.fn\(/);
  });

  it('transformedSource is the real transform: injected import + a clean __rt_ arg (type mode)', async () => {
    const code = await transformedSource('createValidate', 'validate', TYPE);
    // The injected virtual-module import the build plugin adds for the entry tuple.
    expect(code).toMatch(/^import \{__rt_[A-Za-z0-9_]+} from 'virtual:rt\/.+';/m);
    // The call carries the injected id as a clean trailing arg (slot-filling
    // `undefined` padding stripped) - no `(undefined, __rt_…)`.
    expect(code).toMatch(/const validate = createValidate<MyType>\(__rt_[A-Za-z0-9_]+\);/);
    expect(code).not.toContain('undefined, __rt_');
    // The user's import + type body survive verbatim.
    expect(code).toContain("import { createValidate } from 'ts-runtypes';");
    expect(code).toContain('id: number;');
  });

  it('transformedSource cleanup is scoped to the call - user code with (undefined, __rt_x) survives', async () => {
    // A type body containing the exact `(undefined, __rt_…)` pattern the padding
    // cleanup targets - it must NOT be collapsed (regression guard for the fix
    // that scopes the cleanup to the factory call line only).
    const tricky = `type MyType = {value: number};\n// example: someHelper(undefined, __rt_fake123)`;
    const code = await transformedSource('createValidate', 'validate', tricky);
    // The user's line is preserved verbatim.
    expect(code).toContain('someHelper(undefined, __rt_fake123)');
    // The real factory call still gets the clean injected arg (no undefined padding).
    expect(code).toMatch(/const validate = createValidate<MyType>\(__rt_[A-Za-z0-9_]+\);/);
  });

  it('transformedSource injects the id after the schema in the value-first form (mode: schema)', async () => {
    const schema = `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';
const MyType = RT.object({id: TF.number(), name: TF.string()});`;
    const code = await transformedSource('createJsonEncoder', 'toJson', schema, undefined, 'schema');
    expect(code).toMatch(/^import \{__rt_[A-Za-z0-9_]+} from 'virtual:rt\/.+';/m);
    expect(code).toMatch(/const toJson = createJsonEncoder\(MyType, __rt_[A-Za-z0-9_]+\);/);
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

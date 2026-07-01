// Regression for the reported playground bug: a value-first schema snippet with
// an optional-union property (`RT.optional(RT.boolean())`) must resolve to the
// SAME code as its type-first equivalent (`active?: boolean`) — an OPTIONAL
// property, not a required `boolean | undefined` union. The old hand-written
// markerDts overlay approximated `optional` as a required union, so the schema
// form generated the discriminated-union envelope (`[index, value]` / fuEncErr)
// while type-first generated the clean clone. Now the playground feeds the
// resolver the REAL ts-runtypes types, so both converge.
import {beforeAll, describe, expect, it} from 'vitest';
import {generatedCache, setResolver} from '../src/core/index.ts';
import {assetsBuilt, loadNodeResolver} from './nodeResolver.ts';

const TYPE_FORM = `type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`;

const SCHEMA_FORM = `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  active: RT.optional(RT.boolean()),
});`;

const UNION_ENVELOPE = /:\s*\[\d/; // a property encoded as [index, value]
const FU_ENC_ERR = /fuEncErr|does not belong to the union/;

describe('playground / optional-union schema↔type convergence (regression)', () => {
  beforeAll(async () => {
    if (assetsBuilt()) setResolver(await loadNodeResolver());
  });

  it('optional boolean: schema form converges with type-first and emits no union envelope', async () => {
    if (!assetsBuilt()) return;
    const typeMods = await generatedCache('createJsonEncoder', TYPE_FORM, undefined, 'type');
    const schemaMods = await generatedCache('createJsonEncoder', SCHEMA_FORM, undefined, 'schema');

    const pjs = (mods: Array<{name: string; code: string}>) => mods.find((m) => m.name.includes('pjs'))?.code ?? '';
    const typePjs = pjs(typeMods);
    const schemaPjs = pjs(schemaMods);

    // Both forms build the same prepareForJsonSafe clone with an optional
    // presence check — no discriminated-union dispatch.
    for (const [label, code] of [
      ['type-first', typePjs],
      ['schema', schemaPjs],
    ] as const) {
      expect(code, `${label} pjs should exist`).toMatch(/export const __rt_/);
      expect(code, `${label} pjs must not carry a union envelope`).not.toMatch(UNION_ENVELOPE);
      expect(code, `${label} pjs must not carry the union encode error`).not.toMatch(FU_ENC_ERR);
      expect(code, `${label} pjs must use the optional presence check`).toMatch(/v\.active !== undefined/);
    }

    // Convergence: identical structural id (the `pjs.js` module's __rt_<fnHash>_<id>).
    const idOf = (code: string) => code.match(/__rt_[A-Za-z0-9]+_([A-Za-z0-9]+)\s*=/)?.[1];
    expect(idOf(schemaPjs), 'schema and type-first must resolve the same structural id').toBe(idOf(typePjs));
  });
});

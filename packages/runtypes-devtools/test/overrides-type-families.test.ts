// Override coverage as a MATRIX: every function family crossed with every type
// family (atomic, interface, array, tuple, union, circular). The companion to
// the validation/serialization suites, which split by type family — here each
// (type family × function family) cell overrides a type of that shape and CALLS
// the compiled override, proving the type-id fold + redirect emit + runtime
// materialization work for that shape.
//
// A separate, per-test-isolated suite (not folded into the validation/
// serialization suites): an override folds into its type's structural id
// globally, so it would shift unrelated types' ids across a shared suite. Each
// cell gets its own Program (withInlineSources resets), so the type names here
// can repeat freely without leaking.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources} from './helpers/inline.ts';
import {scanResponse, materializeOverrideFn, type AnyFn} from './helpers/overrides.ts';

// A type family = a representative type of one shape. `decl` is any supporting
// declaration; `ref` is the type passed to overrideX<ref>.
interface TypeFamily {
  name: string;
  decl: string;
  ref: string;
}

const TYPE_FAMILIES: TypeFamily[] = [
  {name: 'atomic', decl: '', ref: 'number'},
  {name: 'interface', decl: `type O = {tag: 'o'; a: number; b: string};`, ref: 'O'},
  {name: 'array', decl: `type A = number[];`, ref: 'A'},
  {name: 'tuple', decl: `type Tp = [string, number, boolean];`, ref: 'Tp'},
  {name: 'union', decl: `type U = {k: 'a'; x: number} | {k: 'b'; y: string};`, ref: 'U'},
  {name: 'circular', decl: `type C = {label: string; next: C | null};`, ref: 'C'},
];

// A function family = the override import + a (type-independent) override body +
// a call/assert. The body is uniform across type families so the only variable
// in each cell is the type SHAPE being overridden.
interface FnFamily {
  name: string;
  import: string;
  override: (ref: string) => string;
  call: (fn: AnyFn) => void;
}

// Universal families — applicable to any type shape.
const UNIVERSAL: FnFamily[] = [
  {
    name: 'val',
    import: 'overrideValidate',
    override: (ref) => `overrideValidate<${ref}>((v) => (v as any) === 42);`,
    call: (fn) => {
      expect(fn(42)).toBe(true);
      expect(fn(7)).toBe(false);
    },
  },
  {
    name: 'verr',
    import: 'overrideGetValidationErrors',
    override: (ref) =>
      `overrideGetValidationErrors<${ref}>((value, path, errors) => { const out = errors ?? []; out.push({path: path ?? [], expected: 'X'} as any); return out; });`,
    call: (fn) => {
      const errors = fn(0, [], []);
      expect(errors).toHaveLength(1);
      expect(errors[0].expected).toBe('X');
    },
  },
  {
    name: 'jsonEncoder',
    import: 'overrideJsonEncoder',
    override: (ref) => `overrideJsonEncoder<${ref}>((v) => 'OVR');`,
    call: (fn) => expect(fn(0)).toBe('OVR'),
  },
  {
    name: 'jsonDecoder',
    import: 'overrideJsonDecoder',
    override: (ref) => `overrideJsonDecoder<${ref}>((serialized) => ({d: serialized}));`,
    call: (fn) => expect(fn('z').d).toBe('z'),
  },
  {
    name: 'tb',
    import: 'overrideBinaryEncoder',
    override: (ref) => `overrideBinaryEncoder<${ref}>((value, Ser) => { (Ser as any).w(1); return Ser; });`,
    call: (fn) => {
      const written: number[] = [];
      const ser = {w: (x: number) => written.push(x)};
      expect(fn(0, ser)).toBe(ser);
      expect(written).toEqual([1]);
    },
  },
  {
    name: 'fb',
    import: 'overrideBinaryDecoder',
    override: (ref) => `overrideBinaryDecoder<${ref}>((ret, Des) => ({d: (Des as any).r()}));`,
    call: (fn) => expect(fn(undefined, {r: () => 9}).d).toBe(9),
  },
];

// Object-shaped families — the unknown-keys group + formatTransform only make
// sense on a struct, so they cross with the `interface` family alone.
const OBJECT_ONLY: FnFamily[] = [
  {
    name: 'huk',
    import: 'overrideHasUnknownKeys',
    override: (ref) => `overrideHasUnknownKeys<${ref}>((v) => true);`,
    call: (fn) => expect(fn({})).toBe(true),
  },
  {
    name: 'suk',
    import: 'overrideStripUnknownKeys',
    override: (ref) => `overrideStripUnknownKeys<${ref}>((v) => ({s: true}));`,
    call: (fn) => expect(fn({}).s).toBe(true),
  },
  {
    name: 'uke',
    import: 'overrideUnknownKeyErrors',
    override: (ref) =>
      `overrideUnknownKeyErrors<${ref}>((value, path, errors) => { const out = errors ?? []; out.push({path: ['k'], expected: 'never'} as any); return out; });`,
    call: (fn) => expect(fn({}, [], [])).toHaveLength(1),
  },
  {
    name: 'uku',
    import: 'overrideUnknownKeysToUndefined',
    override: (ref) => `overrideUnknownKeysToUndefined<${ref}>((v) => ({u: undefined}));`,
    call: (fn) => expect('u' in fn({})).toBe(true),
  },
  {
    name: 'fmt',
    import: 'overrideFormatTransform',
    override: (ref) => `overrideFormatTransform<${ref}>((v) => ({f: true}));`,
    call: (fn) => expect(fn({}).f).toBe(true),
  },
];

describe('runtypes-devtools / overrideX type-family matrix', () => {
  const register = hasBinary() ? it : it.skip;

  // One scan per type family: declare every family's override on the same type
  // (its id folds all their cfns), then materialize + call each from its own
  // override site. The override sites come back in source order, so they pair
  // with `families` by index; a mis-pair would fail a family's assert, so the
  // pairing is self-checking.
  async function runFamilyMatrix(tf: TypeFamily, families: FnFamily[]): Promise<void> {
    const imports = families.map((ff) => ff.import).join(', ');
    const overrides = families.map((ff) => ff.override(tf.ref)).join('\n');
    const source = `import {${imports}} from 'ts-runtypes';\n${tf.decl}\n${overrides}\n`;
    await withInlineSources({'call.ts': source}, async ({client, sources}) => {
      const response = await scanResponse(client, sources);
      const sites = response.sites.filter((s) => s.fnId);
      expect(sites, 'one override site per family').toHaveLength(families.length);
      families.forEach((ff, index) => {
        const fn = materializeOverrideFn(response, sites[index]);
        try {
          ff.call(fn);
        } catch (error) {
          throw new Error(`[${tf.name} × ${ff.name}] ${(error as Error).message}`);
        }
      });
    });
  }

  for (const tf of TYPE_FAMILIES) {
    // Every shape runs the universal families; the interface shape additionally
    // runs the object-only families (unknown-keys group + formatTransform).
    const families = tf.name === 'interface' ? [...UNIVERSAL, ...OBJECT_ONLY] : UNIVERSAL;
    register(`${tf.name} — all function families`, () => runFamilyMatrix(tf, families));
  }
});

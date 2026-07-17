// End-to-end clone fuzz: drives REAL compiled `createCloneExactShape<T>()`
// functions through the cloning oracle harness (O15 reference-interpreter
// agreement, O16 isolation, O17 consistency). Runs under the package vitest
// config (with the Vite plugin + Go binary), so the createX call sites below
// are rewritten with the resolved runtype id at compile time.
//
// IMPORTANT: the plugin resolves each createX call STATICALLY from its TYPE
// ARGUMENT, so every factory is called as `createX<T>()` against a literal /
// locally-declared type — never a generic `T` passed through a helper (that
// would inject the `unknown` runtype). Hence the per-target inlining.
//
// Corpus rules (v1):
//   - Atomic unions run the FULL oracle set; they keep AT MOST ONE member
//     per structural family (array/Date/RegExp/Map/Set) so the reference
//     dispatch is unambiguous.
//   - OBJECT-BEARING unions are THROW-TARGETS: the compiled factory is a
//     CES001 alwaysThrow (documented contract), so they live in a separate
//     corpus whose only oracle is the factory-creation throw — no value
//     streams, no reference interpreter.
//   - Circular TYPES are in, with TREE-shaped values (the mock recursion
//     decay keeps them finite). Cyclic VALUES are outside the clone
//     contract — no cycle detection anywhere, pinned by the RangeError test
//     below.
//   - The ONE exclusion: template-literal-keyed index signatures — the
//     compiled sig arm gates keys behind the pattern regex, which the
//     reference interpreter doesn't model yet (it throws loudly if one
//     slips in). Documented follow-up in docs/FUZZING.md.

import {describe, it, expect} from 'vitest';
import {createCloneExactShape, createHasUnknownKeys, createMockData, createValidate, getRunType} from '@ts-runtypes/core';
import {runCloneFuzz, runCloneFuzzForDuration} from './cloneFuzzRunner.ts';
import type {CloneFuzzTarget} from './cloneOracle.ts';

// Class corpus members need a single module-scope identity shared by every
// marker call site AND by the instance-building mock wrapper (same rule as
// suites/cloning/Objects.ts).
class CloneFuzzLedger {
  owner = '';
  balance = 0;
  opened = new Date(0);
  tags: string[] = [];
  summary(): string {
    return `${this.owner}:${this.balance}`;
  }
}

// Circular corpus types live at module scope so the cyclic-value pinning
// test can reuse the same declarations as the fuzz targets.
interface CircTree {
  name: string;
  children?: CircTree[];
}
interface CircPartA {
  tag: string;
  b?: CircPartB;
}
interface CircPartB {
  n: number;
  a?: CircPartA;
}

const targets: CloneFuzzTarget[] = [];

// --- target: flat object of primitives ---
{
  interface FlatUser {
    id: number;
    name: string;
    active: boolean;
  }
  targets.push({
    title: 'FlatUser',
    schema: getRunType<FlatUser>(),
    mock: createMockData<FlatUser>(),
    validate: createValidate<FlatUser>(),
    hasUnknownKeys: createHasUnknownKeys<FlatUser>(),
    clone: createCloneExactShape<FlatUser>(),
  });
}

// --- target: nested object with an array and a sub-object ---
{
  interface Nested {
    tags: string[];
    meta: {count: number; label: string};
  }
  targets.push({
    title: 'Nested',
    schema: getRunType<Nested>(),
    mock: createMockData<Nested>(),
    validate: createValidate<Nested>(),
    hasUnknownKeys: createHasUnknownKeys<Nested>(),
    clone: createCloneExactShape<Nested>(),
  });
}

// --- target: optional properties (absent optionals must stay absent) ---
{
  interface OptionalProps {
    a: string;
    b?: number;
    c?: string;
  }
  targets.push({
    title: 'OptionalProps',
    schema: getRunType<OptionalProps>(),
    mock: createMockData<OptionalProps>(),
    validate: createValidate<OptionalProps>(),
    hasUnknownKeys: createHasUnknownKeys<OptionalProps>(),
    clone: createCloneExactShape<OptionalProps>(),
  });
}

// --- target: declared `undefined`-typed prop (key stays present) ---
{
  interface UndefinedProp {
    a: string;
    c: undefined;
  }
  targets.push({
    title: 'UndefinedProp',
    schema: getRunType<UndefinedProp>(),
    mock: createMockData<UndefinedProp>(),
    validate: createValidate<UndefinedProp>(),
    hasUnknownKeys: createHasUnknownKeys<UndefinedProp>(),
    clone: createCloneExactShape<UndefinedProp>(),
  });
}

// --- target: class instance with a prototype method ---
{
  const mockPlain = createMockData<CloneFuzzLedger>();
  targets.push({
    title: 'ClassLedger',
    schema: getRunType<CloneFuzzLedger>(),
    // The mock walker builds PLAIN objects for class types (validate is
    // structural); wrap into a real instance so the prototype-preserving
    // `Object.create(Object.getPrototypeOf(v))` rebuild path is exercised.
    mock: () => Object.assign(new CloneFuzzLedger(), mockPlain()),
    validate: createValidate<CloneFuzzLedger>(),
    hasUnknownKeys: createHasUnknownKeys<CloneFuzzLedger>(),
    clone: createCloneExactShape<CloneFuzzLedger>(),
  });
}

// --- target: root atomic array ---
{
  targets.push({
    title: 'AtomicArray',
    schema: getRunType<string[]>(),
    mock: createMockData<string[]>(),
    validate: createValidate<string[]>(),
    hasUnknownKeys: createHasUnknownKeys<string[]>(),
    clone: createCloneExactShape<string[]>(),
  });
}

// --- target: root array of objects ---
{
  interface ArrayItem {
    n: number;
    s: string;
  }
  targets.push({
    title: 'ObjectArray',
    schema: getRunType<ArrayItem[]>(),
    mock: createMockData<ArrayItem[]>(),
    validate: createValidate<ArrayItem[]>(),
    hasUnknownKeys: createHasUnknownKeys<ArrayItem[]>(),
    clone: createCloneExactShape<ArrayItem[]>(),
  });
}

// --- target: tuple with a trailing optional slot ---
{
  type TupleOptional = [string, number?];
  targets.push({
    title: 'TupleOptional',
    schema: getRunType<TupleOptional>(),
    mock: createMockData<TupleOptional>(),
    validate: createValidate<TupleOptional>(),
    hasUnknownKeys: createHasUnknownKeys<TupleOptional>(),
    clone: createCloneExactShape<TupleOptional>(),
  });
}

// --- target: tuple with a rest tail ---
{
  type TupleRest = [string, ...number[]];
  targets.push({
    title: 'TupleRest',
    schema: getRunType<TupleRest>(),
    mock: createMockData<TupleRest>(),
    validate: createValidate<TupleRest>(),
    hasUnknownKeys: createHasUnknownKeys<TupleRest>(),
    clone: createCloneExactShape<TupleRest>(),
  });
}

// --- target: tuple mixing a Date slot and an optional object slot ---
{
  type TupleDateObject = [Date, {id: number}?];
  targets.push({
    title: 'TupleDateObject',
    schema: getRunType<TupleDateObject>(),
    mock: createMockData<TupleDateObject>(),
    validate: createValidate<TupleDateObject>(),
    hasUnknownKeys: createHasUnknownKeys<TupleDateObject>(),
    clone: createCloneExactShape<TupleDateObject>(),
  });
}

// --- target: Map with atomic key/value ---
{
  type MapAtomic = Map<string, number>;
  targets.push({
    title: 'MapAtomic',
    schema: getRunType<MapAtomic>(),
    mock: createMockData<MapAtomic>(),
    validate: createValidate<MapAtomic>(),
    hasUnknownKeys: createHasUnknownKeys<MapAtomic>(),
    clone: createCloneExactShape<MapAtomic>(),
  });
}

// --- target: Map with object values (per-entry rebuild) ---
{
  type MapObject = Map<string, {total: number}>;
  targets.push({
    title: 'MapObject',
    schema: getRunType<MapObject>(),
    mock: createMockData<MapObject>(),
    validate: createValidate<MapObject>(),
    hasUnknownKeys: createHasUnknownKeys<MapObject>(),
    clone: createCloneExactShape<MapObject>(),
  });
}

// --- target: Set of atomics ---
{
  type SetAtomic = Set<string>;
  targets.push({
    title: 'SetAtomic',
    schema: getRunType<SetAtomic>(),
    mock: createMockData<SetAtomic>(),
    validate: createValidate<SetAtomic>(),
    hasUnknownKeys: createHasUnknownKeys<SetAtomic>(),
    clone: createCloneExactShape<SetAtomic>(),
  });
}

// --- target: Set of objects (per-element rebuild) ---
{
  type SetObject = Set<{id: number}>;
  targets.push({
    title: 'SetObject',
    schema: getRunType<SetObject>(),
    mock: createMockData<SetObject>(),
    validate: createValidate<SetObject>(),
    hasUnknownKeys: createHasUnknownKeys<SetObject>(),
    clone: createCloneExactShape<SetObject>(),
  });
}

// --- target: Date + Temporal properties (re-wrap / re-materialize) ---
{
  interface DateTemporal {
    at: Date;
    day: Temporal.PlainDate;
    instant: Temporal.Instant;
  }
  targets.push({
    title: 'DateTemporal',
    schema: getRunType<DateTemporal>(),
    mock: createMockData<DateTemporal>(),
    validate: createValidate<DateTemporal>(),
    hasUnknownKeys: createHasUnknownKeys<DateTemporal>(),
    clone: createCloneExactShape<DateTemporal>(),
  });
}

// --- target: RegExp property (re-compile, lastIndex kept) ---
{
  interface RegExpProp {
    pattern: RegExp;
    note: string;
  }
  targets.push({
    title: 'RegExpProp',
    schema: getRunType<RegExpProp>(),
    mock: createMockData<RegExpProp>(),
    validate: createValidate<RegExpProp>(),
    hasUnknownKeys: createHasUnknownKeys<RegExpProp>(),
    clone: createCloneExactShape<RegExpProp>(),
  });
}

// --- target: root record, plain string sig, atomic values ---
{
  type RecordAtomic = Record<string, number>;
  targets.push({
    title: 'RecordAtomic',
    schema: getRunType<RecordAtomic>(),
    mock: createMockData<RecordAtomic>(),
    validate: createValidate<RecordAtomic>(),
    hasUnknownKeys: createHasUnknownKeys<RecordAtomic>(),
    clone: createCloneExactShape<RecordAtomic>(),
  });
}

// --- target: record with object values nested under a declared prop ---
{
  interface RecordObject {
    id: number;
    bag: Record<string, {w: number}>;
  }
  targets.push({
    title: 'RecordObject',
    schema: getRunType<RecordObject>(),
    mock: createMockData<RecordObject>(),
    validate: createValidate<RecordObject>(),
    hasUnknownKeys: createHasUnknownKeys<RecordObject>(),
    clone: createCloneExactShape<RecordObject>(),
  });
}

// --- target: literal-union field (immutable members — passthrough arm) ---
{
  interface LiteralUnionField {
    status: 'on' | 'off';
    n: number;
  }
  targets.push({
    title: 'LiteralUnionField',
    schema: getRunType<LiteralUnionField>(),
    mock: createMockData<LiteralUnionField>(),
    validate: createValidate<LiteralUnionField>(),
    hasUnknownKeys: createHasUnknownKeys<LiteralUnionField>(),
    clone: createCloneExactShape<LiteralUnionField>(),
  });
}

// --- target: Date | null field (atomic-union Date dispatch arm) ---
{
  interface UnionDateNull {
    due: Date | null;
    title: string;
  }
  targets.push({
    title: 'UnionDateNull',
    schema: getRunType<UnionDateNull>(),
    mock: createMockData<UnionDateNull>(),
    validate: createValidate<UnionDateNull>(),
    hasUnknownKeys: createHasUnknownKeys<UnionDateNull>(),
    clone: createCloneExactShape<UnionDateNull>(),
  });
}

// --- target: string[] | number field (atomic-union array dispatch arm) ---
{
  interface UnionArrayOrNumber {
    data: string[] | number;
  }
  targets.push({
    title: 'UnionArrayOrNumber',
    schema: getRunType<UnionArrayOrNumber>(),
    mock: createMockData<UnionArrayOrNumber>(),
    validate: createValidate<UnionArrayOrNumber>(),
    hasUnknownKeys: createHasUnknownKeys<UnionArrayOrNumber>(),
    clone: createCloneExactShape<UnionArrayOrNumber>(),
  });
}

// --- target: root atomic union (fully immutable — identity/noop clone) ---
{
  type AtomicUnionRoot = string | number;
  targets.push({
    title: 'AtomicUnionRoot',
    schema: getRunType<AtomicUnionRoot>(),
    mock: createMockData<AtomicUnionRoot>(),
    validate: createValidate<AtomicUnionRoot>(),
    hasUnknownKeys: createHasUnknownKeys<AtomicUnionRoot>(),
    clone: createCloneExactShape<AtomicUnionRoot>(),
  });
}

// --- target: atomic unions mixing a primitive with a mutable native ---
{
  interface UnionMixedNatives {
    when: string | Date;
    items: string | string[];
  }
  targets.push({
    title: 'UnionMixedNatives',
    schema: getRunType<UnionMixedNatives>(),
    mock: createMockData<UnionMixedNatives>(),
    validate: createValidate<UnionMixedNatives>(),
    hasUnknownKeys: createHasUnknownKeys<UnionMixedNatives>(),
    clone: createCloneExactShape<UnionMixedNatives>(),
  });
}

// --- target: circular type — self-referencing tree via optional array ---
// The mock recursion decay (optionalProbability / maxMockRecursion) keeps
// the generated values FINITE trees, and recursion runs through OPTIONAL
// positions so a depth bail-out is just an absent optional (still valid).
{
  targets.push({
    title: 'CircularTree',
    schema: getRunType<CircTree>(),
    mock: createMockData<CircTree>(),
    validate: createValidate<CircTree>(),
    hasUnknownKeys: createHasUnknownKeys<CircTree>(),
    clone: createCloneExactShape<CircTree>(),
  });
}

// --- target: circular type — mutual recursion across two interfaces ---
{
  targets.push({
    title: 'CircularMutual',
    schema: getRunType<CircPartA>(),
    mock: createMockData<CircPartA>(),
    validate: createValidate<CircPartA>(),
    hasUnknownKeys: createHasUnknownKeys<CircPartA>(),
    clone: createCloneExactShape<CircPartA>(),
  });
}

// --- target: deep composition (objects in arrays in objects, Dates inside) ---
{
  interface DeepComposite {
    org: {
      teams: Array<{name: string; members: Array<{id: number; joined: Date}>}>;
    };
    founded: Date;
  }
  targets.push({
    title: 'DeepComposite',
    schema: getRunType<DeepComposite>(),
    mock: createMockData<DeepComposite>(),
    validate: createValidate<DeepComposite>(),
    hasUnknownKeys: createHasUnknownKeys<DeepComposite>(),
    clone: createCloneExactShape<DeepComposite>(),
  });
}

// --- target: function-valued prop (declared member kept, shared by ref) ---
{
  interface FnProp {
    name: string;
    onClick: () => void;
  }
  const hasUnknownKeysFn = createHasUnknownKeys<FnProp>();
  targets.push({
    title: 'FnProp',
    schema: getRunType<FnProp>(),
    // nonDataTypes makes the mock carry a REAL function so the shared-by-
    // reference contract is exercised (default mocks skip non-data members).
    mock: createMockData<FnProp>(undefined, {mock: {nonDataTypes: true}}),
    validate: createValidate<FnProp>(),
    // Function-valued members are NOT in hasUnknownKeys' default known-keys
    // list (the RT skips non-data members) while the clone KEEPS them
    // (declared members are never dropped — CES010). `checkNonRTProps`
    // widens the key list to the full declared shape so the extras
    // cross-check stays sound for this target.
    hasUnknownKeys: (value) => hasUnknownKeysFn(value, {checkNonRTProps: true}),
    clone: createCloneExactShape<FnProp>(),
  });
}

// --- target: bigint + symbol props (by-value vs opaque-by-reference) ---
{
  interface BigintSymbol {
    big: bigint;
    sym: symbol;
    label: string;
  }
  targets.push({
    title: 'BigintSymbol',
    schema: getRunType<BigintSymbol>(),
    mock: createMockData<BigintSymbol>(),
    validate: createValidate<BigintSymbol>(),
    hasUnknownKeys: createHasUnknownKeys<BigintSymbol>(),
    clone: createCloneExactShape<BigintSymbol>(),
  });
}

// Object-bearing unions: without runtime arm discrimination the emitter
// cannot know WHICH declared shape to rebuild, so the factory is a CES001
// alwaysThrow (a clone that silently kept unknown keys would be a security
// bug). These are THROW-TARGETS: the only oracle is the factory-creation
// throw — no value streams, no reference interpreter.
const throwTargets: Array<{title: string; createClone: () => unknown}> = [
  {
    title: 'DisjointObjectUnion',
    createClone: () => createCloneExactShape<{a: string} | {b: number}>(),
  },
  {
    title: 'DiscriminatedUnion',
    createClone: () => createCloneExactShape<{kind: 'a'; va: string} | {kind: 'b'; vb: number}>(),
  },
];

describe('fuzz / cloning — oracle sweep over compiled createCloneExactShape', () => {
  it('finds no oracle violations across all targets', () => {
    const report = runCloneFuzz(targets, {seed: 0xc10e5eed, iterations: 100});
    if (report.violations.length > 0) {
      const summary = report.violations
        .slice(0, 25)
        .map((v) => `  [${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n      value=${v.value}`)
        .join('\n');
      throw new Error(
        `${report.violations.length} oracle violation(s) over ${report.runs} runs:\n${summary}` +
          (report.violations.length > 25 ? `\n  …and ${report.violations.length - 25} more` : '')
      );
    }
    expect(report.runs).toBe(targets.length * 100);
  });

  it('object-bearing unions stay CES001 alwaysThrow factories', () => {
    for (const target of throwTargets) {
      expect(target.createClone, target.title).toThrow(/CES001/);
    }
  });

  it('cyclic VALUES overflow the stack — the accepted failure mode', () => {
    // Cyclic VALUES are outside the clone contract (corpus values are
    // trees) and the compiled clone deliberately carries NO cycle
    // detection — per explicit user decision the RangeError stack overflow
    // is the accepted, documented failure mode. This test pins it.
    const clone = createCloneExactShape<CircTree>();
    const node: CircTree = {name: 'loop'};
    node.children = [node];
    expect(() => clone(node)).toThrow(RangeError);
  });

  // Autonomous soak: opt-in via `RT_FUZZ_CLONE_SOAK_MS=<ms>`. Runs continuously
  // for the given duration, logging every violation as it is found. Skipped in
  // normal CI runs.
  const soakMs = Number(process.env.RT_FUZZ_CLONE_SOAK_MS ?? 0);
  it.runIf(soakMs > 0)(
    'soak — clone-fuzz continuously and log all findings',
    () => {
      const report = runCloneFuzzForDuration(targets, soakMs, {seed: Number(process.env.RT_FUZZ_SEED ?? 1)}, (v) => {
        console.error(`[fuzz][${v.oracle}/${v.phase}] ${v.target} (seed=${v.seed}): ${v.message}\n    value=${v.value}`);
      });
      console.error(`[fuzz] clone soak finished: ${report.runs} runs, ${report.violations.length} violation(s)`);
      expect(report.violations).toHaveLength(0);
    },
    soakMs + 30_000
  );
});

// Determinism ("do-it-twice") fuzz for seeded mock data. For a RANDOM runtype
// and a random seed S, generating a mock twice under seed S must produce
// deep-equal values. The property is universal (it holds for every type), which
// is what makes it a good fuzz oracle.
//
// It drives the walker `mockRunType(runType, options, [])` directly over
// hand-built RunType graphs — the same lower-level entry the MockData unit tests
// use — because `createMockData` needs a plugin-injected id that a runtime-built
// schema can't carry. A fresh `new MockRandom(seed)` per generation seeds the
// options bag exactly as createMockData would, so this measures the same code.
//
// Each iteration runs under `withSeededRandom`, so the generated shape and the
// tested seed replay from one number; the seeded mock path draws from its OWN
// PRNG (never the swapped global `Math.random`), so its determinism is what we
// measure. Data-only shapes on purpose: symbols never compare deep-equal
// (`Symbol(x) !== Symbol(x)`) and Temporal instances have no structural
// identity, so both are excluded here and pinned separately in
// test/suites/mocking/mockSeed.test.ts.

import {isDeepStrictEqual} from 'node:util';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {mockRunType} from '../../../src/mocking/mockType.ts';
import {MockRandom} from '../../../src/mocking/mockRandom.ts';
import {defaultMockOptions} from '../../../src/mocking/constants.mock.ts';
import type {RunTypeMockOptions} from '../../../src/mocking/mockTypes.ts';
import type {RunType} from '../../../src/runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../../../src/go-generated/runTypeKind.generated.ts';
// Side-effect: registers the per-kind format mock fns (uuid / number / bigint)
// so a runtype carrying a formatAnnotation resolves through the seeded path.
import '../../../src/formats/index.ts';

const rnd = (): number => Math.random();
const upTo = (n: number): number => Math.floor(rnd() * n);

let nextId = 0;
function rt(node: Partial<RunType>): RunType {
  return {id: `rt${nextId++}`, ...node} as RunType;
}

// Leaf runtypes over the serialisable-data space (no symbol / Temporal).
const LEAVES: Array<() => RunType> = [
  () => rt({kind: RunTypeKind.string}),
  () => rt({kind: RunTypeKind.number}),
  () => rt({kind: RunTypeKind.bigint}),
  () => rt({kind: RunTypeKind.boolean}),
  () => rt({kind: RunTypeKind.literal, literal: (['a', 1, true, 'kind'] as unknown[])[upTo(4)]}),
  () => rt({kind: RunTypeKind.class, subKind: RunTypeSubKind.date}),
  () => rt({kind: RunTypeKind.string, formatAnnotation: {name: 'uuid', params: {version: '4'}}}),
  () => rt({kind: RunTypeKind.string, formatAnnotation: {name: 'uuid', params: {version: '7'}}}),
];

const FIELD_NAMES = ['a', 'b', 'c', 'd', 'e', 'f'];

/** A random data runtype, depth-bounded. Composers: object, array, tuple,
 *  discriminated union, and index signature (record). **/
export function randomRunType(depth: number): RunType {
  if (depth >= 3 || rnd() < 0.45) return LEAVES[upTo(LEAVES.length)]();
  switch (upTo(5)) {
    case 0: {
      const count = 1 + upTo(4);
      const children: RunType[] = [];
      for (let i = 0; i < count; i++) {
        children.push(
          rt({kind: RunTypeKind.propertySignature, name: FIELD_NAMES[i], child: randomRunType(depth + 1), optional: rnd() < 0.3})
        );
      }
      return rt({kind: RunTypeKind.objectLiteral, children});
    }
    case 1:
      return rt({kind: RunTypeKind.array, child: randomRunType(depth + 1)});
    case 2: {
      const count = 1 + upTo(3);
      const children: RunType[] = [];
      for (let i = 0; i < count; i++) children.push(rt({kind: RunTypeKind.tupleMember, child: randomRunType(depth + 1)}));
      return rt({kind: RunTypeKind.tuple, children});
    }
    case 3: {
      // Discriminated union: each member is an object with a distinct `kind`
      // literal plus one payload field.
      const count = 2 + upTo(3);
      const members: RunType[] = [];
      for (let i = 0; i < count; i++) {
        members.push(
          rt({
            kind: RunTypeKind.objectLiteral,
            children: [
              rt({kind: RunTypeKind.propertySignature, name: 'kind', child: rt({kind: RunTypeKind.literal, literal: `k${i}`})}),
              rt({kind: RunTypeKind.propertySignature, name: 'payload', child: randomRunType(depth + 1)}),
            ],
          })
        );
      }
      return rt({kind: RunTypeKind.union, children: members});
    }
    default:
      return rt({
        kind: RunTypeKind.indexSignature,
        index: rt({kind: rnd() < 0.5 ? RunTypeKind.string : RunTypeKind.number}),
        child: randomRunType(depth + 1),
      });
  }
}

/** Generate a mock for `runType` exactly as createMockData would seed it: a
 *  fresh `MockRandom(seed)` on the options bag (native when `seed` is
 *  undefined). Small collection / string caps keep generations fast. **/
export function generateMock(runType: RunType, seed: number | undefined): unknown {
  const random = seed === undefined ? undefined : new MockRandom(seed);
  const options: RunTypeMockOptions = {
    mock: {...defaultMockOptions, seed, random, maxRandomItemsLength: 6, maxRandomStringLength: 12},
  };
  return mockRunType(runType, options, []);
}

export interface SeedViolation {
  mockSeed: number;
  iterSeed: number;
  message: string;
}

/** The do-it-twice oracle: two same-seed generations of the SAME runtype must
 *  be deep-equal (a fresh MockRandom(seed) each time, mirroring createMockData's
 *  per-invocation reset). Returns a violation or null. **/
export function checkSeedDeterminism(runType: RunType, mockSeed: number, iterSeed: number): SeedViolation | null {
  if (!isDeepStrictEqual(generateMock(runType, mockSeed), generateMock(runType, mockSeed))) {
    return {mockSeed, iterSeed, message: 'two same-seed generations produced different values'};
  }
  return null;
}

export interface MockSeedReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: SeedViolation[];
}

/** Run `iterations` reproducible iterations; each builds a random runtype and a
 *  random seed, then checks the determinism oracle. Pure data-in / report-out
 *  (seed carried through) so a finding replays via `withSeededRandom(iterSeed)`. **/
export function runMockSeedFuzz(options: {seed?: number; iterations?: number} = {}): MockSeedReport {
  const seed = options.seed ?? 0x5eed1234;
  const iterations = options.iterations ?? 300;
  const violations: SeedViolation[] = [];
  let runs = 0;
  for (let i = 0; i < iterations; i++) {
    const iterSeed = mixSeed(seed, 'mock-seed-determinism', i);
    withSeededRandom(iterSeed, () => {
      runs++;
      const runType = randomRunType(0);
      const mockSeed = 1 + upTo(1_000_000);
      const violation = checkSeedDeterminism(runType, mockSeed, iterSeed);
      if (violation) violations.push(violation);
    });
  }
  return {runs, iterations, seed, violations};
}

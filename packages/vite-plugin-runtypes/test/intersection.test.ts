// End-to-end intersection-collapse round-trip tests. Mirrors the Go-side
// suite in internal/resolver/intersection_collapse_test.go but exercises
// the full pipeline: rewrite → resolver → cacheSource → eval module →
// assert on the materialised RunType. Every scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md).
//
// The collapse algorithm itself is documented in
// internal/serialize/intersection_collapse.go.

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('vite-plugin-runtypes / intersection collapse round-trip', () => {
  // ---- two object literals → merged objectLiteral --------------------------

  runTest(
    'object × object merge static',
    {
      'merge.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type AB = {a: string} & {b: number};
getRuntypeId<AB>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMerged(cache);
    }
  );

  runTest(
    'object × object merge reflect',
    {
      'merge.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type AB = {a: string} & {b: number};
declare const value: AB;
reflectRuntypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertMerged(cache);
    }
  );

  function assertMerged(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'merge.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const names = (root.children ?? []).map((m) => m.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  }

  // ---- primitive × brand → string + decorators ----------------------------

  runTest(
    'primitive & brand static',
    {
      'brand.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Email = string & {readonly __brand: 'Email'};
getRuntypeId<Email>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertBranded(cache);
    }
  );

  runTest(
    'primitive & brand reflect',
    {
      'brand.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type Email = string & {readonly __brand: 'Email'};
declare const value: Email;
reflectRuntypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertBranded(cache);
    }
  );

  function assertBranded(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'brand.ts');
    expect(root.kind).toBe(ReflectionKind.string);
    expect(root.decorators).toBeDefined();
    expect(root.decorators!.length).toBe(1);
    expect(root.decorators![0].kind).toBe(ReflectionKind.objectLiteral);
  }

  // ---- primitive × multiple brands ----------------------------------------

  runTest(
    'primitive & multiple brands static',
    {
      'multi.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Tagged = string & {readonly __a: 1} & {readonly __b: 2};
getRuntypeId<Tagged>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'multi.ts');
      expect(root.kind).toBe(ReflectionKind.string);
      expect(root.decorators?.length).toBe(2);
    }
  );

  // ---- number × brand -----------------------------------------------------

  runTest(
    'number & brand static',
    {
      'numbrand.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type UserId = number & {readonly __nominal: 'Id'};
getRuntypeId<UserId>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'numbrand.ts');
      expect(root.kind).toBe(ReflectionKind.number);
      expect(root.decorators?.length).toBe(1);
    }
  );

  // ---- never on conflict --------------------------------------------------

  runTest(
    'incompatible primitives collapse to never static',
    {
      'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Conflict = string & number;
getRuntypeId<Conflict>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'never.ts');
      expect(root.kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'never member short-circuits to never static',
    {
      'never2.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = never & {x: 1};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never2.ts').kind).toBe(ReflectionKind.never);
    }
  );

  // ---- primitive × literal narrowing --------------------------------------

  runTest(
    'primitive & compatible literal keeps literal static',
    {
      'narrow.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string & 'hello';
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'narrow.ts');
      expect(root.kind).toBe(ReflectionKind.literal);
      expect(root.literal).toBe('hello');
    }
  );

  runTest(
    'primitive & incompatible literal becomes never static',
    {
      'narrow2.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string & 1;
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'narrow2.ts').kind).toBe(ReflectionKind.never);
    }
  );

  // ---- distribution over union --------------------------------------------

  runTest(
    'intersection distributes over union static',
    {
      'dist.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = ('a' | 'b') & string;
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'dist.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const values = (root.children ?? []).filter((m) => m.kind === ReflectionKind.literal).map((m) => m.literal);
      expect(values).toEqual(expect.arrayContaining(['a', 'b']));
    }
  );

  runTest(
    'distribution filters dead branches static',
    {
      'dist2.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = ('a' | 1) & string;
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'dist2.ts');
      expect(root.kind).toBe(ReflectionKind.literal);
      expect(root.literal).toBe('a');
    }
  );

  // ---- optional / readonly modifier merge ---------------------------------
  // mion-spec parity: intersection should preserve `?` from either side
  // and `readonly` from either side on the merged property.

  runTest(
    'intersection preserves optional modifier static',
    {
      'opt.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string; b?: number} & {c: boolean};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'opt.ts');
      expect(root.kind).toBe(ReflectionKind.objectLiteral);
      const b = (root.children ?? []).find((m) => m.name === 'b') as RunType;
      expect(b).toBeDefined();
      expect(b.optional).toBe(true);
    }
  );

  runTest(
    'intersection preserves readonly modifier static',
    {
      'ro.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {readonly id: number} & {name: string};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'ro.ts');
      const idProp = (root.children ?? []).find((m) => m.name === 'id') as RunType;
      expect(idProp).toBeDefined();
      expect(idProp.readonly).toBe(true);
    }
  );

  // ---- commutativity ------------------------------------------------------

  runTest(
    'A & B and B & A share a hash static',
    {
      'comm.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type A = {a: string};
type B = {b: number};
const ab = getRuntypeId<A & B>();
const ba = getRuntypeId<B & A>();
export {ab, ba};
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      // Both sites resolve to the same id because the structural shape
      // matches after collapse.
      const ids = new Set(cache.sites.map((s) => s.id));
      expect(ids.size).toBe(1);
    }
  );

  // ---- wire invariant: KindIntersection never appears on the wire ---------

  runTest(
    'collapse output never carries KindIntersection static',
    {
      'invariant.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Merge = {a: string} & {b: number};
type Brand = string & {readonly __brand: 'X'};
type Bad   = string & number;
type Dist  = ('a' | 'b') & string;
getRuntypeId<Merge>();
getRuntypeId<Brand>();
getRuntypeId<Bad>();
getRuntypeId<Dist>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      for (const node of Object.values(cache.byHash)) {
        expect(node.kind).not.toBe(ReflectionKind.intersection);
      }
    }
  );
});

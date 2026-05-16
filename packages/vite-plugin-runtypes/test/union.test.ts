// End-to-end union round-trip tests. Mirrors the Go-side suite in
// internal/resolver/union_safeorder_test.go but exercises the full
// pipeline (rewrite → resolver → cacheSource → eval module → assert
// on the materialised RunType). The serialize-time analysis populates
// safeUnionChildren, safeUnionPosition on each child ref, and
// isUnionDiscriminator on selected properties — every scenario below
// pins down one of those wire-format outputs.
//
// Algorithm references:
//   - mion-run-types unionDiscriminator.ts: sortUnreachableTypes,
//     markDiscriminators, splitUnionItems
//   - Go port: internal/serialize/union_safeorder.go

import {describe, expect} from 'vitest';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('vite-plugin-runtypes / union safe-order + discriminator round-trip', () => {
  // ---- safe-order: subset member gets sorted first ------------------------

  runTest(
    'subset member sorts after superset (1+2 props) static',
    {
      'subset.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSubsetReorder(cache);
    }
  );

  runTest(
    'subset member sorts after superset (1+2 props) reflect',
    {
      'subset.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number};
declare const value: T;
reflectRuntypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertSubsetReorder(cache);
    }
  );

  function assertSubsetReorder(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'subset.ts');
    expect(root.kind).toBe(ReflectionKind.union);
    expect(root.safeUnionChildren).toBeDefined();
    expect(root.safeUnionChildren!.length).toBe(2);
    // The first safe-order entry must be the 2-prop member.
    const first = root.safeUnionChildren![0];
    expect(first.children?.filter((m) => m.kind === ReflectionKind.propertySignature).length).toBe(2);
  }

  // ---- safe-order: deeper subset chain ------------------------------------

  runTest(
    'deep subset chain orders by prop count static',
    {
      'deep.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'deep.ts');
      expect(root.safeUnionChildren?.length).toBe(3);
      const sizes = (root.safeUnionChildren ?? []).map(
        (m) => m.children?.filter((c) => c.kind === ReflectionKind.propertySignature).length ?? 0
      );
      expect(sizes).toEqual([3, 2, 1]);
    }
  );

  // ---- safe-order: each child appears in safeUnionChildren ----------------
  // In the emitted module shape, canonical nodes are shared singletons,
  // so per-ref `safeUnionPosition` is JSON-only. We assert the
  // round-trip invariant: every child appears exactly once in
  // `safeUnionChildren` and consumers can derive position via indexOf.

  runTest(
    'each child has a slot in safeUnionChildren static',
    {
      'pos.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number} | {x: boolean};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'pos.ts');
      expect(root.children?.length).toBe(3);
      expect(root.safeUnionChildren?.length).toBe(3);
      for (const child of root.children ?? []) {
        const slot = root.safeUnionChildren!.indexOf(child);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(root.safeUnionChildren![slot]).toBe(child);
      }
    }
  );

  // ---- discriminator: shared 'kind' field ---------------------------------

  runTest(
    'shared-name kind literal marked discriminator static',
    {
      'disc.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertDiscriminator(cache, 'kind', 2);
    }
  );

  runTest(
    'shared-name kind literal marked discriminator reflect',
    {
      'disc.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
declare const value: T;
reflectRuntypeId(value);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      assertDiscriminator(cache, 'kind', 2);
    }
  );

  // ---- discriminator: shared with non-distinct types is NOT marked --------

  runTest(
    'shared name but same type is not a discriminator static',
    {
      'shared.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {kind: string; x: 1} | {kind: string; y: 2};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'shared.ts');
      let markedKind = 0;
      for (const member of root.children ?? []) {
        for (const prop of member.children ?? []) {
          if (prop.name === 'kind' && prop.isUnionDiscriminator) markedKind++;
        }
      }
      expect(markedKind).toBe(0);
    }
  );

  // ---- discriminator: unique-prop fallback --------------------------------

  runTest(
    'no shared name falls back to unique-prop discriminator static',
    {
      'uniq.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {b: number};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'uniq.ts');
      let aMarked = false;
      let bMarked = false;
      for (const member of root.children ?? []) {
        for (const prop of member.children ?? []) {
          if (prop.name === 'a' && prop.isUnionDiscriminator) aMarked = true;
          if (prop.name === 'b' && prop.isUnionDiscriminator) bMarked = true;
        }
      }
      expect(aMarked).toBe(true);
      expect(bMarked).toBe(true);
    }
  );

  // ---- discriminator: primitive-only union → no marks ---------------------

  runTest(
    'primitive-only union has no discriminator marks static',
    {
      'prim.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | number;
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'prim.ts');
      for (const member of root.children ?? []) {
        expect(member.isUnionDiscriminator).toBeUndefined();
      }
    }
  );

  // ---- nested unions get flattened by Distributed() -----------------------

  runTest(
    'nested union flattens to a single 3-member union static',
    {
      'nested.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type Inner = 'a' | 'b';
type T = Inner | 'c';
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'nested.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      expect(root.children?.length).toBe(3);
    }
  );

  // ---- union with null/undefined ------------------------------------------

  runTest(
    'union with null and undefined static',
    {
      'nullable.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | null | undefined;
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'nullable.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const kinds = (root.children ?? []).map((m) => m.kind);
      expect(kinds).toEqual(expect.arrayContaining([ReflectionKind.string, ReflectionKind.null, ReflectionKind.undefined]));
    }
  );

  // ---- union of arrays ----------------------------------------------------

  runTest(
    'union of arrays static',
    {
      'arrunion.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string[] | number[];
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'arrunion.ts');
      expect(root.kind).toBe(ReflectionKind.union);
      const arrayMembers = (root.children ?? []).filter((m) => m.kind === ReflectionKind.array);
      expect(arrayMembers.length).toBe(2);
    }
  );

  // ---- unrelated objects keep declaration order in safe order ------------

  runTest(
    'unrelated objects keep declaration order static',
    {
      'unrel.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {b: number};
getRuntypeId<T>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const root = getTypeFor(cache, 'unrel.ts');
      expect(root.safeUnionChildren?.length).toBe(2);
      // First entry should still be the {a:string} side.
      const firstNames = (root.safeUnionChildren![0].children ?? []).map((p) => p.name);
      expect(firstNames).toContain('a');
      const secondNames = (root.safeUnionChildren![1].children ?? []).map((p) => p.name);
      expect(secondNames).toContain('b');
    }
  );

  // ---- helper -------------------------------------------------------------

  function assertDiscriminator(
    cache: Parameters<typeof getTypeFor>[0],
    propName: string,
    expectedMarks: number
  ): void {
    const root = getTypeFor(cache, 'disc.ts');
    let marks = 0;
    for (const member of root.children ?? []) {
      for (const prop of member.children ?? []) {
        if (prop.name === propName && prop.isUnionDiscriminator) marks++;
      }
    }
    expect(marks).toBe(expectedMarks);
  }
});

// End-to-end member-type round-trip tests. Mirrors atomic.test.ts's
// `evalCacheFor` + `getTypeFor` setup. Each scenario has paired static
// (getRuntypeId<T>()) and reflect (reflectRuntypeId(v)) tests per the
// marker test coverage rule (CLAUDE.md). The recursive fixture is the
// critical cycle-safety proof — child slots must close on the root via
// referential equality after the virtual cache evaluates.

import {describe, it, expect} from 'vitest';
import {KIND_REF, ReflectionKind, type Type} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, hasBinary} from './helpers/inline.ts';

describe('vite-plugin-runtypes / member round-trip', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('array of string static', async () => {
    const cache = await evalCacheFor({
      'array.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string[]>();
`,
    });
    assertArrayOfString(cache);
  });

  runMaybe('array of string reflect', async () => {
    const cache = await evalCacheFor({
      'array.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: string[];
reflectRuntypeId(xs);
`,
    });
    assertArrayOfString(cache);
  });

  function assertArrayOfString(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'array.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.type as Type;
    expect(elem).toBeDefined();
    expect(elem.kind).toBe(ReflectionKind.string);
  }

  runMaybe('array of object literal static', async () => {
    const cache = await evalCacheFor({
      'arrobj.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<{x: number}[]>();
`,
    });
    assertArrayOfObject(cache);
  });

  runMaybe('array of object literal reflect', async () => {
    const cache = await evalCacheFor({
      'arrobj.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: {x: number}[];
reflectRuntypeId(xs);
`,
    });
    assertArrayOfObject(cache);
  });

  function assertArrayOfObject(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'arrobj.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.type as Type;
    expect(elem.kind).toBe(ReflectionKind.objectLiteral);
    const xProp = elem.types?.find((m) => m.name === 'x');
    expect(xProp).toBeDefined();
    expect(xProp!.kind).toBe(ReflectionKind.propertySignature);
    expect((xProp!.type as Type).kind).toBe(ReflectionKind.number);
  }

  runMaybe('array of array of string static', async () => {
    const cache = await evalCacheFor({
      'arrarr.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string[][]>();
`,
    });
    assertArrayOfArray(cache);
  });

  runMaybe('array of array of string reflect', async () => {
    const cache = await evalCacheFor({
      'arrarr.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: string[][];
reflectRuntypeId(xs);
`,
    });
    assertArrayOfArray(cache);
  });

  function assertArrayOfArray(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'arrarr.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const inner = root.type as Type;
    expect(inner.kind).toBe(ReflectionKind.array);
    expect((inner.type as Type).kind).toBe(ReflectionKind.string);
  }

  // Cycle-safety proof for both forms. The footer emits
  // `t_<arrayId>.type = t_<treeId>;` so walking root → children → array →
  // element returns the SAME object as the root by reference.
  runMaybe('recursive self type static closes cycle by reference', async () => {
    const cache = await evalCacheFor({
      'tree.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface Tree {
  children: Tree[];
}
getRuntypeId<Tree>();
`,
    });
    assertRecursiveTreeCycle(cache);
  });

  runMaybe('recursive self type reflect closes cycle by reference', async () => {
    const cache = await evalCacheFor({
      'tree.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
interface Tree {
  children: Tree[];
}
declare const t: Tree;
reflectRuntypeId(t);
`,
    });
    assertRecursiveTreeCycle(cache);
  });

  function assertRecursiveTreeCycle(cache: Parameters<typeof getTypeFor>[0]) {
    const root = getTypeFor(cache, 'tree.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const childrenProp = root.types?.find((m) => m.name === 'children');
    expect(childrenProp).toBeDefined();
    const arr = childrenProp!.type as Type;
    expect(arr.kind).toBe(ReflectionKind.array);
    const back = arr.type as Type;
    expect(back).toBeDefined();
    expect(back.kind).not.toBe(KIND_REF);
    // Referential equality — the cache footer wired the same const reference
    // into both the root slot and the back-edge.
    expect(back).toBe(root);
  }
});

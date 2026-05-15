// End-to-end member-type round-trip tests. Mirrors atomic.test.ts's
// `evalCacheFor` + `getTypeFor` setup. The critical case is the recursive
// fixture: walking through child slots after the virtual cache evaluates
// must return to the root via REFERENTIAL EQUALITY, proving the emit footer
// closes the cycle by direct const assignment with no forward-reference
// errors at module load.

import {describe, it, expect} from 'vitest';
import {KIND_REF, ReflectionKind, type Type} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, hasBinary} from './helpers/inline.ts';

describe('vite-plugin-runtypes / member round-trip', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('array of string', async () => {
    const cache = await evalCacheFor({
      'array.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: string[];
getRuntypeId(xs);
`,
    });
    const root = getTypeFor(cache, 'array.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.type as Type;
    expect(elem).toBeDefined();
    expect(elem.kind).toBe(ReflectionKind.string);
  });

  runMaybe('array of object literal', async () => {
    const cache = await evalCacheFor({
      'arrobj.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: {x: number}[];
getRuntypeId(xs);
`,
    });
    const root = getTypeFor(cache, 'arrobj.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const elem = root.type as Type;
    expect(elem.kind).toBe(ReflectionKind.objectLiteral);
    const xProp = elem.types?.find((m) => m.name === 'x');
    expect(xProp).toBeDefined();
    expect(xProp!.kind).toBe(ReflectionKind.propertySignature);
    expect((xProp!.type as Type).kind).toBe(ReflectionKind.number);
  });

  runMaybe('array of array of string', async () => {
    const cache = await evalCacheFor({
      'arrarr.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const xs: string[][];
getRuntypeId(xs);
`,
    });
    const root = getTypeFor(cache, 'arrarr.ts');
    expect(root.kind).toBe(ReflectionKind.array);
    const inner = root.type as Type;
    expect(inner.kind).toBe(ReflectionKind.array);
    expect((inner.type as Type).kind).toBe(ReflectionKind.string);
  });

  // The cycle-safety proof. The footer emits `t_<arrayId>.type = t_<treeId>;`
  // so once the module evaluates, walking root → children property → array →
  // element returns the SAME object as the root by reference — no forward-
  // reference error, no infinite expansion.
  runMaybe('recursive self type closes cycle by reference', async () => {
    const cache = await evalCacheFor({
      'tree.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
interface Tree {
  children: Tree[];
}
declare const t: Tree;
getRuntypeId<Tree>(t);
`,
    });
    const root = getTypeFor(cache, 'tree.ts');
    expect(root.kind).toBe(ReflectionKind.objectLiteral);
    const childrenProp = root.types?.find((m) => m.name === 'children');
    expect(childrenProp).toBeDefined();
    const arr = childrenProp!.type as Type;
    expect(arr.kind).toBe(ReflectionKind.array);
    const back = arr.type as Type;
    expect(back).toBeDefined();
    expect(back.kind).not.toBe(KIND_REF);
    // Referential equality is the proof — the cache footer wired the same
    // const reference into both the root slot and the back-edge.
    expect(back).toBe(root);
  });
});

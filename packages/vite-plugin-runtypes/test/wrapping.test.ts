// Wrapping tests — every scenario lives in its own `it()` with a
// self-contained inline source, mirroring the per-test structure of
// rewrite.test.ts and atomic.test.ts.
//
// Coverage matrix:
//   17a–17d  user-defined wrappers and direct calls (positive — site emitted)
//   17e–17f  free-T body / wrong-module collision (negative — skipped)
//   passthrough  wrappers that forward `id` to inner calls — outer site
//                only; inner free-T calls stay untouched
//   explicit-id  caller already filled the trailing slot — scanner must
//                NOT emit a site (no override of caller-supplied ids)

import {describe, it, expect} from 'vitest';
import {rewrite} from '../src/rewrite.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

describe('vite-plugin-runtypes / wrapping', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  // ---- 17a–17d: positive cases — user-defined wrappers --------------------

  runMaybe('17a: direct getRuntypeId call, T inferred from val', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRuntypeId(u);
`;
    await withInlineSources(
      {'17a.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17a.ts', sources['17a.ts'], client);
        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        expect(out).toContain(`getRuntypeId(u, ${JSON.stringify(sites[0].id)});`);
      },
      {reset: true}
    );
  });

  runMaybe('17b: explicit type argument, zero positional args — pads with undefined', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const b = getRuntypeId<string>();
`;
    await withInlineSources(
      {'17b.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17b.ts', sources['17b.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/getRuntypeId<string>\(undefined, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  runMaybe('17c: user-defined wrapper with explicit type argument', async () => {
    const code = `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);
`;
    await withInlineSources(
      {'17c.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17c.ts', sources['17c.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/isType<\{flag: boolean\}>\(true, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  runMaybe('17d: user-defined wrapper with T inferred from argument', async () => {
    const code = `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function nameOf<T>(_val: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});
`;
    await withInlineSources(
      {'17d.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17d.ts', sources['17d.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/nameOf\(\{kind: 'node', value: 42\}, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  // ---- 17e–17f: negative cases --------------------------------------------

  runMaybe('17e: call inside generic wrapper body with free T — no site', async () => {
    const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(val: T): RuntypeId<T> {
  return getRuntypeId<T>(val);
}
export {inner};
`;
    await withInlineSources(
      {'17e.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17e.ts', sources['17e.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`return getRuntypeId<T>(val);`);
      },
      {reset: true}
    );
  });

  runMaybe('17f: same-name RuntypeId from a non-marker module is ignored', async () => {
    const code = `type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
`;
    await withInlineSources(
      {'17f.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('17f.ts', sources['17f.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`maskedWrapper('noop');`);
      },
      {reset: true}
    );
  });

  // ---- Pass-through wrappers ----------------------------------------------

  runMaybe('passthrough A: wrapper forwards id to getRuntypeId — outer site only', async () => {
    const code = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function getTypeIdWrapper<T>(value?: T, id?: RuntypeId<T>): RuntypeId<T> {
  return getRuntypeId<T>(value, id);
}
const x = getTypeIdWrapper({a: 1});
`;
    await withInlineSources(
      {'pt_a.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('pt_a.ts', sources['pt_a.ts'], client);
        // Outer call site (getTypeIdWrapper({a: 1})) is concrete-T, so 1 site.
        // Inner call (getRuntypeId<T>(value, id)) has free T AND the id slot
        // is already filled by the parameter — either reason skips it.
        expect(sites.length).toBe(1);
        expect(out).toMatch(/getTypeIdWrapper\(\{a: 1\}, "[A-Za-z0-9]+"\)/);
        // Inner forwarding call stays exactly as written.
        expect(out).toContain(`return getRuntypeId<T>(value, id);`);
      },
      {reset: true}
    );
  });

  runMaybe('passthrough B: wrapper-of-wrapper forwarding id — only outermost site emitted', async () => {
    const code = `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(_v: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, id?: RuntypeId<T>): RuntypeId<T> {
  return inner(v, id);
}
const y = outer({k: 'v'});
`;
    await withInlineSources(
      {'pt_b.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('pt_b.ts', sources['pt_b.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/outer\(\{k: 'v'\}, "[A-Za-z0-9]+"\)/);
        expect(out).toContain(`return inner(v, id);`);
      },
      {reset: true}
    );
  });

  runMaybe('passthrough C: wrapper-of-wrapper, intermediate drops id — outer-only site', async () => {
    const code = `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(_v: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, _id?: RuntypeId<T>): RuntypeId<T> {
  return inner(v);
}
const z = outer({n: 7});
`;
    await withInlineSources(
      {'pt_c.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('pt_c.ts', sources['pt_c.ts'], client);
        // Outer call: concrete T → 1 site.
        // inner(v) inside outer's body: T is outer's free type parameter →
        // skipped via the free-T guard.
        expect(sites.length).toBe(1);
        expect(out).toMatch(/outer\(\{n: 7\}, "[A-Za-z0-9]+"\)/);
        expect(out).toContain(`return inner(v);`);
      },
      {reset: true}
    );
  });

  // ---- Caller-supplied explicit id ----------------------------------------

  runMaybe('explicit D: caller passes literal id to getRuntypeId — no rewrite', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRuntypeId(u, 'manualHash');
`;
    await withInlineSources(
      {'ex_d.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('ex_d.ts', sources['ex_d.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`getRuntypeId(u, 'manualHash');`);
      },
      {reset: true}
    );
  });

  runMaybe('explicit E: caller passes literal id to a user-defined wrapper — no rewrite', async () => {
    const code = `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true, 'manualHash');
`;
    await withInlineSources(
      {'ex_e.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('ex_e.ts', sources['ex_e.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`isType<{flag: boolean}>(true, 'manualHash');`);
      },
      {reset: true}
    );
  });

  runMaybe('explicit F: caller pads slot 0 with undefined and supplies an id literal — no rewrite', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const b = getRuntypeId<string>(undefined, 'manualHash');
`;
    await withInlineSources(
      {'ex_f.ts': code},
      async ({client, sources}) => {
        const {code: out, sites} = await rewrite('ex_f.ts', sources['ex_f.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`getRuntypeId<string>(undefined, 'manualHash');`);
      },
      {reset: true}
    );
  });
});

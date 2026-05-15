// Wrapping tests — every scenario lives in its own runTest with a
// self-contained inline source. Each direct-marker scenario has paired
// _static (getRuntypeId<T>()) and _reflect (reflectRuntypeId(v)) tests per
// the marker test coverage rule (CLAUDE.md). User-defined wrappers and
// passthrough scenarios are also covered for both wrapper-arity shapes.
//
// Coverage matrix:
//   17a–17d  direct calls + user-defined wrappers (positive — site emitted)
//   17e–17f  free-T body / wrong-module collision (negative — skipped)
//   passthrough  wrappers that forward `id` to inner calls — outer site
//                only; inner free-T calls stay untouched
//   explicit-id  caller already filled the trailing slot — scanner must
//                NOT emit a site (no override of caller-supplied ids)

import {describe, expect} from 'vitest';
import {rewrite} from '../src/rewrite.ts';
import {runTest, withInlineSources} from './helpers/inline.ts';

// ---- 17a: direct call ---------------------------------------------------

const wrap17aStaticSrc = {
  '17a_static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const a = getRuntypeId<{id: number; name: string}>();
`,
};

const wrap17aReflectSrc = {
  '17a_reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = reflectRuntypeId(u);
`,
};

// ---- 17b: primitive ----------------------------------------------------

const wrap17bStaticSrc = {
  '17b_static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const b = getRuntypeId<string>();
`,
};

const wrap17bReflectSrc = {
  '17b_reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const s: string = 'hello';
const b = reflectRuntypeId(s);
`,
};

// ---- 17c–17d: user-defined wrappers ------------------------------------

const wrap17cSrc = {
  '17c.ts': `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);
`,
};

const wrap17dSrc = {
  '17d.ts': `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function nameOf<T>(_val: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});
`,
};

// ---- 17e–17f: negative cases ------------------------------------------

const wrap17eStaticSrc = {
  '17e_static.ts': `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(_val: T): RuntypeId<T> {
  return getRuntypeId<T>();
}
export {inner};
`,
};

const wrap17eReflectSrc = {
  '17e_reflect.ts': `import {reflectRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(val: T): RuntypeId<T> {
  return reflectRuntypeId<T>(val);
}
export {inner};
`,
};

const wrap17fSrc = {
  '17f.ts': `type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
`,
};

// ---- Pass-through wrappers --------------------

const passthroughAStaticSrc = {
  'pt_a_static.ts': `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function getTypeIdWrapper<T>(id?: RuntypeId<T>): RuntypeId<T> {
  return getRuntypeId<T>(id);
}
const x = getTypeIdWrapper<{a: number}>();
`,
};

const passthroughAReflectSrc = {
  'pt_a_reflect.ts': `import {reflectRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
function reflectWrapper<T>(value: T, id?: RuntypeId<T>): RuntypeId<T> {
  return reflectRuntypeId<T>(value, id);
}
const x = reflectWrapper({a: 1});
`,
};

const passthroughBSrc = {
  'pt_b.ts': `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(_v: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, id?: RuntypeId<T>): RuntypeId<T> {
  return inner(v, id);
}
const y = outer({k: 'v'});
`,
};

const passthroughCSrc = {
  'pt_c.ts': `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function inner<T>(_v: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
function outer<T>(v: T, _id?: RuntypeId<T>): RuntypeId<T> {
  return inner(v);
}
const z = outer({n: 7});
`,
};

// ---- Caller-supplied explicit id ------------------------------

const explicitDStaticSrc = {
  'ex_d_static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const a = getRuntypeId<{id: number; name: string}>('manualHash');
`,
};

const explicitDReflectSrc = {
  'ex_d_reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = reflectRuntypeId(u, 'manualHash');
`,
};

const explicitESrc = {
  'ex_e.ts': `import {type RuntypeId} from '@mionjs/ts-go-run-types';
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true, 'manualHash');
`,
};

describe('vite-plugin-runtypes / wrapping', () => {
  // ---- 17a: direct call -------------------------------------------------

  runTest('17a static: getRuntypeId<T>() — explicit type, no value', wrap17aStaticSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17a_static.ts', sources['17a_static.ts'], client);
        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // No preceding args — injected id sits in slot 0.
        expect(out).toMatch(/getRuntypeId<\{id: number; name: string\}>\("[A-Za-z0-9]+"\);/);
      },
      {reset: true}
    );
  });

  runTest('17a reflect: reflectRuntypeId(v) — T inferred from value', wrap17aReflectSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17a_reflect.ts', sources['17a_reflect.ts'], client);
        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        expect(out).toContain(`reflectRuntypeId(u, ${JSON.stringify(sites[0].id)});`);
      },
      {reset: true}
    );
  });

  // ---- 17b: primitive ---------------------------------------------------

  runTest('17b static: getRuntypeId<string>() — primitive type argument', wrap17bStaticSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17b_static.ts', sources['17b_static.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/getRuntypeId<string>\("[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  runTest('17b reflect: reflectRuntypeId(s) — primitive value', wrap17bReflectSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17b_reflect.ts', sources['17b_reflect.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/reflectRuntypeId\(s, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  // ---- 17c–17d: user-defined wrappers -----------------------------------
  //
  // User wrappers carry their own trailing RuntypeId<T> slot. The two
  // arities below — value-arg wrapper (isType) and value-as-T wrapper
  // (nameOf) — are the natural mirrors of the static and reflect helpers
  // and are kept under separate runTest()s.

  runTest('17c: user-defined wrapper with explicit type argument', wrap17cSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17c.ts', sources['17c.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/isType<\{flag: boolean\}>\(true, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  runTest('17d: user-defined wrapper with T inferred from argument', wrap17dSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17d.ts', sources['17d.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/nameOf\(\{kind: 'node', value: 42\}, "[A-Za-z0-9]+"\)/);
      },
      {reset: true}
    );
  });

  // ---- 17e–17f: negative cases — paired for both forms -------------------

  runTest('17e static: getRuntypeId<T>() inside generic body with free T — no site', wrap17eStaticSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17e_static.ts', sources['17e_static.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`return getRuntypeId<T>();`);
      },
      {reset: true}
    );
  });

  runTest(
    '17e reflect: reflectRuntypeId<T>(val) inside generic body with free T — no site',
    wrap17eReflectSrc,
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('17e_reflect.ts', sources['17e_reflect.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`return reflectRuntypeId<T>(val);`);
        },
        {reset: true}
      );
    }
  );

  runTest('17f: same-name RuntypeId from a non-marker module is ignored', wrap17fSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('17f.ts', sources['17f.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`maskedWrapper('noop');`);
      },
      {reset: true}
    );
  });

  // ---- Pass-through wrappers — paired for both helpers --------------------

  runTest(
    'passthrough A static: wrapper forwards id to getRuntypeId — outer site only',
    passthroughAStaticSrc,
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_a_static.ts', sources['pt_a_static.ts'], client);
          // Outer call (getTypeIdWrapper<{a: number}>()) is concrete-T → 1 site.
          // Inner call (getRuntypeId<T>(id)) has free T → skipped.
          expect(sites.length).toBe(1);
          expect(out).toMatch(/getTypeIdWrapper<\{a: number\}>\("[A-Za-z0-9]+"\)/);
          expect(out).toContain(`return getRuntypeId<T>(id);`);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'passthrough A reflect: wrapper forwards id to reflectRuntypeId — outer site only',
    passthroughAReflectSrc,
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('pt_a_reflect.ts', sources['pt_a_reflect.ts'], client);
          // Outer call (reflectWrapper({a: 1})) is concrete-T → 1 site.
          // Inner call (reflectRuntypeId<T>(value, id)) has free T AND id slot
          // is already filled by the parameter — either reason skips it.
          expect(sites.length).toBe(1);
          expect(out).toMatch(/reflectWrapper\(\{a: 1\}, "[A-Za-z0-9]+"\)/);
          expect(out).toContain(`return reflectRuntypeId<T>(value, id);`);
        },
        {reset: true}
      );
    }
  );

  runTest('passthrough B: wrapper-of-wrapper forwarding id — only outermost site emitted', passthroughBSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('pt_b.ts', sources['pt_b.ts'], client);
        expect(sites.length).toBe(1);
        expect(out).toMatch(/outer\(\{k: 'v'\}, "[A-Za-z0-9]+"\)/);
        expect(out).toContain(`return inner(v, id);`);
      },
      {reset: true}
    );
  });

  runTest('passthrough C: wrapper-of-wrapper, intermediate drops id — outer-only site', passthroughCSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('pt_c.ts', sources['pt_c.ts'], client);
        // Outer call: concrete T → 1 site.
        // inner(v) inside outer's body: T is outer's free type parameter → skipped.
        expect(sites.length).toBe(1);
        expect(out).toMatch(/outer\(\{n: 7\}, "[A-Za-z0-9]+"\)/);
        expect(out).toContain(`return inner(v);`);
      },
      {reset: true}
    );
  });

  // ---- Caller-supplied explicit id — paired ------------------------------

  runTest('explicit D static: caller passes literal id to getRuntypeId — no rewrite', explicitDStaticSrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('ex_d_static.ts', sources['ex_d_static.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`getRuntypeId<{id: number; name: string}>('manualHash');`);
      },
      {reset: true}
    );
  });

  runTest(
    'explicit D reflect: caller passes literal id to reflectRuntypeId — no rewrite',
    explicitDReflectSrc,
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {code: out, sites} = await rewrite('ex_d_reflect.ts', sources['ex_d_reflect.ts'], client);
          expect(sites.length).toBe(0);
          expect(out).toContain(`reflectRuntypeId(u, 'manualHash');`);
        },
        {reset: true}
      );
    }
  );

  runTest('explicit E: caller passes literal id to a user-defined wrapper — no rewrite', explicitESrc, async (sources) => {
    await withInlineSources(
      sources,
      async ({client}) => {
        const {code: out, sites} = await rewrite('ex_e.ts', sources['ex_e.ts'], client);
        expect(sites.length).toBe(0);
        expect(out).toContain(`isType<{flag: boolean}>(true, 'manualHash');`);
      },
      {reset: true}
    );
  });
});

// End-to-end acceptance tests for `overrideX<T>(pureFn)` over the real
// inline-server pipeline (ResolverClient + the Go binary).
//
// One test inspects the rendered redirect tuple + cfn module (structure); the
// rest MATERIALIZE the two-hop redirect→cfn and CALL the override, asserting its
// custom behavior at runtime — one per family (val, verr, the unknown-keys group,
// fmt, binary tb/fb, json encoder/decoder) plus a recursive type.
//
// Why a SEPARATE suite (not folded into the validation/serialization suites): an
// override is global — it folds into the structural id of its type everywhere —
// so declaring one inside a shared suite would shift unrelated types' ids across
// that whole suite. Here every test is isolated (withInlineSources resets the
// Program) and uses a UNIQUE per-test type, so overrides never leak.
//
// The override site itself carries `InjectTypeFnArgs<T, fnKey>`, so it demands
// its own family entry — no `createX` twin is needed to make the redirect emit.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules} from './helpers/inline.ts';
import type {ResolverClient} from '../src/resolver-client.ts';
import type {Site} from '../src/protocol.ts';

type AnyFn = (...args: any[]) => any;

// scanResponse runs scanFiles(includeEntryModules) over the inline sources.
async function scanResponse(client: ResolverClient, augmented: Record<string, string>) {
  const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
  return client.scanFiles(files, {includeEntryModules: true});
}

// materializeOverrideFn resolves a site's redirect entry and returns the live
// override function by following the redirect → cfn hop with a minimal rtUtils
// whose `usePureFn` reads the evaluated cfn tuple's factory (slot 8). The override
// is self-contained (pure), so no runtype/getRT wiring is needed.
function materializeOverrideFn(response: {sites: Site[]; entryModules?: Record<string, string>}): AnyFn {
  const site = response.sites.find((s) => s.fnId);
  if (!site || !site.fnId) throw new Error('expected a site with an fnId');
  const tuples = evalEntryModules(response.entryModules ?? {});
  const redirect = tuples[site.fnId + '_' + site.id] as readonly unknown[];
  if (!redirect) throw new Error(`no redirect entry for ${site.fnId}_${site.id}`);

  const cfnByKey: Record<string, readonly unknown[]> = {};
  for (const tuple of Object.values(tuples)) {
    if (Array.isArray(tuple) && tuple[0] === 2) cfnByKey[String(tuple[3])] = tuple; // KIND_PURE_FN
  }
  const utl: {usePureFn(key: string): AnyFn} = {
    usePureFn(key: string): AnyFn {
      const cfn = cfnByKey[key];
      if (!cfn) throw new Error(`no cfn module for ${key}`);
      return (cfn[8] as (u: unknown) => AnyFn)(utl); // override factory ignores utl, returns the fn
    },
  };
  return (redirect[9] as (u: unknown) => AnyFn)(utl); // createRTFn(utl) → the override fn
}

describe('runtypes-devtools / overrideX', () => {
  const register = hasBinary() ? it : it.skip;

  // withOverrideFn scans a single override-only source, materializes the override
  // fn, and hands it to the assertion. Each call uses a unique type, so the
  // global fold never crosses tests.
  async function withOverrideFn(source: string, assert: (fn: AnyFn) => void): Promise<void> {
    await withInlineSources({'call.ts': source}, async ({client, sources}) => {
      assert(materializeOverrideFn(await scanResponse(client, sources)));
    });
  }

  register('overrideValidate<string> emits a cfn redirect + cfn module', async () => {
    await withInlineSources(
      {
        'call.ts': `import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => v === 'OK');
export const isString = createValidate<string>();
`,
      },
      async ({client, sources}) => {
        const response = await scanResponse(client, sources);
        const site = response.sites.find((s) => s.fnId);
        if (!site || !site.fnId) throw new Error('expected a createValidate site with an fnId');
        const tuples = evalEntryModules(response.entryModules ?? {});
        const tuple = tuples[site.fnId + '_' + site.id] as readonly unknown[];
        expect(tuple, 'expected redirect entry').toBeDefined();
        expect(tuple[0]).toBe('val');
        expect(tuple[6]).toBe(false); // never noop
        const pureFnDeps = tuple[8] as string[];
        expect(Array.isArray(pureFnDeps) && pureFnDeps.length).toBeTruthy();
        expect(pureFnDeps[0].startsWith('cfn::')).toBe(true);
        expect(String(tuple[5])).toContain('usePureFn');
        expect(Object.values(response.entryModules ?? {}).join('\n')).toContain("v === 'OK'");
      }
    );
  });

  // ----- per-family runtime calls (every public family) -----

  register('val — overrideValidate returns the custom boolean', async () => {
    await withOverrideFn(
      `import {overrideValidate} from 'ts-runtypes';
type VT = {kind: 'vt'; value: number};
overrideValidate<VT>((v) => (v as any)?.value === 42);
`,
      (fn) => {
        expect(fn({kind: 'vt', value: 42})).toBe(true);
        expect(fn({kind: 'vt', value: 7})).toBe(false);
        expect(fn(null)).toBe(false);
      }
    );
  });

  register('verr — overrideGetValidationErrors pushes custom errors', async () => {
    await withOverrideFn(
      `import {overrideGetValidationErrors} from 'ts-runtypes';
type ET = {tag: 'et'; n: number};
overrideGetValidationErrors<ET>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'custom'} as any);
  return out;
});
`,
      (fn) => {
        const errors = fn({tag: 'et', n: 1}, [], []);
        expect(errors).toHaveLength(1);
        expect(errors[0].expected).toBe('custom');
      }
    );
  });

  register('huk — overrideHasUnknownKeys returns the custom predicate', async () => {
    await withOverrideFn(
      `import {overrideHasUnknownKeys} from 'ts-runtypes';
type HT = {tag: 'ht'; a: number};
overrideHasUnknownKeys<HT>((v) => (v as any)?.extra === true);
`,
      (fn) => {
        expect(fn({tag: 'ht', a: 1, extra: true})).toBe(true);
        expect(fn({tag: 'ht', a: 1})).toBe(false);
      }
    );
  });

  register('suk — overrideStripUnknownKeys deletes the extra key', async () => {
    await withOverrideFn(
      `import {overrideStripUnknownKeys} from 'ts-runtypes';
type ST = {tag: 'st'; a: number};
overrideStripUnknownKeys<ST>((v) => {
  delete (v as any).extra;
  return v;
});
`,
      (fn) => {
        const out = fn({tag: 'st', a: 1, extra: 2});
        expect('extra' in out).toBe(false);
        expect(out.a).toBe(1);
      }
    );
  });

  register('uke — overrideUnknownKeyErrors reports the unknown key', async () => {
    await withOverrideFn(
      `import {overrideUnknownKeyErrors} from 'ts-runtypes';
type UET = {tag: 'uet'; a: number};
overrideUnknownKeyErrors<UET>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: ['extra'], expected: 'never'} as any);
  return out;
});
`,
      (fn) => {
        const errors = fn({tag: 'uet', a: 1, extra: 2}, [], []);
        expect(errors).toHaveLength(1);
        expect(errors[0].expected).toBe('never');
      }
    );
  });

  register('uku — overrideUnknownKeysToUndefined nulls out the extra key', async () => {
    await withOverrideFn(
      `import {overrideUnknownKeysToUndefined} from 'ts-runtypes';
type UUT = {tag: 'uut'; a: number};
overrideUnknownKeysToUndefined<UUT>((v) => {
  (v as any).extra = undefined;
  return v;
});
`,
      (fn) => {
        const out = fn({tag: 'uut', a: 1, extra: 2});
        expect('extra' in out).toBe(true);
        expect(out.extra).toBeUndefined();
      }
    );
  });

  register('fmt — overrideFormatTransform rewrites the value', async () => {
    await withOverrideFn(
      `import {overrideFormatTransform} from 'ts-runtypes';
type FT = {tag: 'ft'; a: number};
overrideFormatTransform<FT>((v) => ({...(v as any), fmt: true}));
`,
      (fn) => {
        const out = fn({tag: 'ft', a: 1});
        expect(out.fmt).toBe(true);
        expect(out.a).toBe(1);
      }
    );
  });

  register('tb — overrideBinaryEncoder writes through the serializer', async () => {
    await withOverrideFn(
      `import {overrideBinaryEncoder} from 'ts-runtypes';
type BT = {tag: 'bt'; n: number};
overrideBinaryEncoder<BT>((value, Ser) => {
  (Ser as any).writeU8((value as any).n);
  return Ser;
});
`,
      (fn) => {
        const written: number[] = [];
        const ser = {writeU8: (x: number) => written.push(x)};
        const returned = fn({tag: 'bt', n: 7}, ser);
        expect(written).toEqual([7]);
        expect(returned).toBe(ser);
      }
    );
  });

  register('fb — overrideBinaryDecoder reads through the deserializer', async () => {
    await withOverrideFn(
      `import {overrideBinaryDecoder} from 'ts-runtypes';
type FBT = {tag: 'fbt'; n: number};
overrideBinaryDecoder<FBT>((ret, Des) => ({n: (Des as any).readU8()}));
`,
      (fn) => {
        const des = {readU8: () => 42};
        const out = fn(undefined, des);
        expect(out.n).toBe(42);
      }
    );
  });

  register('jsonEncoder — overrideJsonEncoder returns the hand-tuned string', async () => {
    await withOverrideFn(
      `import {overrideJsonEncoder} from 'ts-runtypes';
type JET = {tag: 'jet'; id: number};
overrideJsonEncoder<JET>((v) => '{"id":' + (v as any).id + '}');
`,
      (fn) => {
        expect(fn({tag: 'jet', id: 7})).toBe('{"id":7}');
      }
    );
  });

  register('jsonDecoder — overrideJsonDecoder parses with the custom body', async () => {
    await withOverrideFn(
      `import {overrideJsonDecoder} from 'ts-runtypes';
type JDT = {tag: 'jdt'; id: number};
overrideJsonDecoder<JDT>((serialized) => JSON.parse(serialized as any));
`,
      (fn) => {
        expect(fn('{"tag":"jdt","id":9}')).toEqual({tag: 'jdt', id: 9});
      }
    );
  });

  // ----- recursive type -----

  register('recursive type — the override walks the whole chain', async () => {
    await withOverrideFn(
      `type RNode = {label: string; child: RNode | null};
import {overrideValidate} from 'ts-runtypes';
overrideValidate<RNode>((v) => {
  let n = v as any;
  while (n !== null && typeof n === 'object') {
    if (typeof n.label !== 'string') return false;
    n = n.child;
  }
  return n === null;
});
`,
      (fn) => {
        expect(fn({label: 'a', child: {label: 'b', child: {label: 'c', child: null}}})).toBe(true);
        expect(fn({label: 'a', child: {label: 42, child: null}})).toBe(false);
        expect(fn({label: 'a', child: {label: 'b', child: {}}})).toBe(false); // tail not null-terminated
      }
    );
  });
});

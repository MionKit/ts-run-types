// Wrapping test — verifies that user-defined generic helpers whose trailing
// parameter is `RuntypeId<T>` get the same compile-time id injection as
// `getRuntypeId` itself, and that a same-named-but-non-mion-package
// `RuntypeId<T>` is correctly ignored.

import {describe, it, expect} from 'vitest';
import {rewrite} from '../src/rewrite.js';
import {hasBinary, withInlineSources} from './helpers/inline.js';

// Four positive sites (17a–17d) and two negative cases (17e free-T body,
// 17f wrong-module collision) live together so the resolver can see every
// shape in one program.
const F17_SOURCE = `import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';
export {};

// 17a — direct call, T inferred from val.
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRuntypeId(u);

// 17b — explicit type argument, no positional args.
const b = getRuntypeId<string>();

// 17c — user-defined wrapper. The trailing \`id?: RuntypeId<T>\` opts the
// function into transformer injection at every call site, just like
// getRuntypeId itself.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);

// 17d — wrapper used with T inferred from an argument.
function nameOf<T>(_val: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17e — call inside a generic body. \`T\` is the *outer* free type parameter,
// so this must be SKIPPED by the scanner — there's nothing to inject yet.
function inner<T>(val: T): RuntypeId<T> {
  return getRuntypeId<T>(val);
}

// 17f — collision: a user-defined type also named \`RuntypeId\`, declared
// outside the marker module. The scanner must ignore this — only the
// \`@mionjs/ts-go-run-types\` one counts.
type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
`;

describe('vite-plugin-runtypes / wrapping', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('user-defined wrapper with RuntypeId<T> trailing param gets injected', async () => {
    await withInlineSources({'f17.ts': F17_SOURCE}, async ({client, sources}) => {
      const {code: out, sites} = await rewrite('f17.ts', sources['f17.ts'], client);

      // f17 has four directly rewritable sites (17a–17d). The two negative
      // cases (17e free-T body, 17f wrong-module) are skipped.
      expect(sites.length).toBe(4);

      for (const s of sites) {
        expect(s.id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      }

      const ids = sites.map((s) => JSON.stringify(s.id));
      // 17c — explicit type arg, wrapper. Argument was `true`.
      expect(out).toMatch(/isType<\{flag: boolean\}>\(true, "[A-Za-z0-9]+"\)/);
      // 17d — inferred from object. The injected id sits after the obj arg.
      expect(out).toMatch(/nameOf\(\{kind: 'node', value: 42\}, "[A-Za-z0-9]+"\)/);
      // Every site's id is unique to its T, so all four show up in the patched output.
      for (const idLit of ids) {
        expect(out).toContain(idLit);
      }

      // Negative-case 17e: the call `getRuntypeId<T>(val)` inside the
      // generic body of `inner<T>` must NOT have an injected id, because
      // T is unbound there. The body stays as-is.
      expect(out).toContain(`return getRuntypeId<T>(val);`);

      // Negative-case 17f: `maskedWrapper("noop")` references a local
      // `RuntypeId_Local` type, not from `@mionjs/ts-go-run-types`. The call
      // must remain untouched.
      expect(out).toContain(`maskedWrapper('noop');`);
    });
  });

  runMaybe('calls with zero args still get the id at the right slot', async () => {
    await withInlineSources({'f17.ts': F17_SOURCE}, async ({client, sources}) => {
      const {code: out} = await rewrite('f17.ts', sources['f17.ts'], client);
      // 17b — `getRuntypeId<string>()` has zero args but the trailing slot
      // is the second parameter (paramIndex 1). The patcher pads with
      // `undefined` so the id lands at slot 1.
      expect(out).toMatch(/getRuntypeId<string>\(undefined, "[A-Za-z0-9]+"\)/);
    });
  });
});

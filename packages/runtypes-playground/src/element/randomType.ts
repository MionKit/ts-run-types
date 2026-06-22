// The "Random type" button uses RunTypes' OWN type generator — the seeded fuzz
// generator its test suite uses to stress the resolver / plugin / runtime
// pipeline (packages/ts-runtypes/test/fuzz/typeGen.ts) — adapted to assign the
// generated root to `MyType`. Reusing the real generator means the button
// showcases exactly the shape space the library is tested against, rather than a
// bespoke reimplementation.
//
// Preset: the DataOnly space (NONDATA) — clean serialisable base PLUS the stripped
// kinds (symbol / function / method / Promise / class / native binary), with
// `wild` OFF so it never emits the unmockable `never` / `any`. Capped shallow with
// clean identifier keys for readability. The engine passes `nonDataTypes: true` to
// createMockType so it produces values for the non-data members rather than
// throwing; validate / serializers drop them as usual.

import {genType, renderGenerated, NONDATA_GEN_OPTIONS, type GenOptions} from '../core/fuzzTypeGen.ts';
import {ROOT_TYPE} from '../core/index.ts';

const PLAYGROUND_GEN_OPTIONS: GenOptions = {
  ...NONDATA_GEN_OPTIONS,
  maxDepth: 3,
  maxBreadth: 3,
  weirdKeys: false,
};

/** A freshly generated `type MyType = …` (plus any named declarations it
 *  references), produced by RunTypes' own fuzz type generator. */
export function randomTypeDefinition(): string {
  const {decls, rootExpr} = renderGenerated(genType(PLAYGROUND_GEN_OPTIONS));
  const header = decls ? `${decls}\n\n` : '';
  return `${header}type ${ROOT_TYPE} = ${rootExpr};`;
}

// F1 regression: binaryEncode used to apply the index-signature value encoder
// to NAMED properties on objects that mix an index signature with named props,
// crashing (`The "src" argument must be of type string`, `reading 'size' of
// undefined`). JSON handled it; the cross-wire rule flagged the divergence.
// These shapes must now round-trip on the binary wire and agree with JSON.
import {describe, it, expect} from 'vitest';
import {hasBinary, openClient, compileType} from './typeFuzzHarness.ts';
import type {GeneratedType, TypeShape} from './typeGen.ts';

function prop(name: string, shape: TypeShape, optional = false) {
  return {name, optional, readonly: false, method: false, shape};
}

// `{p0?: Record<string, number>; [k: string]: string}` and
// `{n0?: Set<number>; [k: string]: Map<string, Date>}` — the two soak crashers.
const cases: {title: string; gen: GeneratedType}[] = [
  {
    title: '{p0?: Record<string, number>; [k: string]: string}',
    gen: {
      decls: [],
      root: {kind: 'object', props: [prop('p0', {kind: 'record', value: {kind: 'number'}}, true)], index: {kind: 'string'}},
    },
  },
  {
    title: '{n0?: Set<number>; [k: string]: Map<string, Date>}',
    gen: {
      decls: [],
      root: {
        kind: 'object',
        props: [prop('n0', {kind: 'set', elem: {kind: 'number'}}, true)],
        index: {kind: 'map', key: {kind: 'string'}, value: {kind: 'date'}},
      },
    },
  },
];

describe('F1 — binary index signature + named properties', () => {
  for (const {title, gen} of cases) {
    (hasBinary() ? it : it.skip)(`round-trips and agrees across wires: ${title}`, () => {
      const client = openClient();
      return compileType(client, gen)
        .then((compiled) => {
          expect(compiled.resolverError, compiled.resolverError).toBeUndefined();
          expect(compiled.evalError, compiled.evalError).toBeUndefined();
          const {mock, jsonEncode, jsonDecode, binaryEncode, binaryDecode} = compiled.wired;
          expect(
            mock && jsonEncode && jsonDecode && binaryEncode && binaryDecode,
            JSON.stringify(compiled.wireErrors)
          ).toBeTruthy();
          for (let i = 0; i < 25; i++) {
            const value = mock!();
            // Binary must not crash and must round-trip byte-stably.
            const b1 = new Uint8Array(binaryEncode!(value));
            const b2 = new Uint8Array(binaryEncode!(binaryDecode!(binaryEncode!(value))));
            expect([...b2], `binary not stable for ${title}`).toEqual([...b1]);
            // JSON and binary must agree on the decoded value.
            const viaJson = jsonEncode!(value);
            const viaBinary = jsonEncode!(binaryDecode!(binaryEncode!(value)));
            expect(viaBinary, `wires disagree for ${title}`).toBe(viaJson);
          }
        })
        .finally(() => client.close());
    });
  }
});

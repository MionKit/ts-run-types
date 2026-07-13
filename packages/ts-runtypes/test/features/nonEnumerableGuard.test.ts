// Runtime-enumerability guard for global-inherited + `@nonEnumerable` props
// (docs/done/runtime-enumerability-checks-for-global-props.md). The serializer
// families that build output BY NAME — prepareForJsonSafe (clone, the default),
// stringifyJson (direct), compactForJson (compact), and toBinary — gate a
// guarded property's write on a runtime own-enumerability check
// (`Object.prototype.propertyIsEnumerable`, i.e. JSON.stringify semantics). The
// mutate strategy delegates to native JSON.stringify, which already honors
// enumerability. Guarded props are optional in the projected shape, so
// validators / the decode presence path accept their absence.
//
// (Marker coverage rule: both getRunTypeId call shapes, converging + hash-equal.)

import {describe, expect, it} from 'vitest';
import {
  createValidate,
  createGetValidationErrors,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  getRunType,
  getRunTypeId,
  type RunType,
} from '@ts-runtypes/core';

// A user type opting one property out of unconditional serialization via the
// `@nonEnumerable` JSDoc tag — the type-aware bridge for a descriptor TS can't
// express (it models only readonly / `?`).
interface Doc {
  id: string;
  /** @nonEnumerable */
  secret: string;
}

function withSecret(enumerable: boolean): Doc {
  const doc = {id: 'd1'} as Doc;
  Object.defineProperty(doc, 'secret', {value: 'shhh', enumerable, writable: true, configurable: true});
  return doc;
}

// Encoder strategy paired with a decoder that reads its wire (clone/mutate/
// direct all emit standard JSON → strip decoder; compact emits a positional
// array → compact decoder). `secret` is a DECLARED prop, so strip-vs-preserve
// (which differ only on undeclared extras) is immaterial here.
const STRATEGY_PAIRS = [
  {encode: 'clone', decode: 'strip'},
  {encode: 'mutate', decode: 'preserve'},
  {encode: 'direct', decode: 'strip'},
  {encode: 'compact', decode: 'compact'},
] as const;

describe('@nonEnumerable guard — JSON strategies', () => {
  for (const {encode: encStrategy, decode: decStrategy} of STRATEGY_PAIRS) {
    it(`[${encStrategy}] non-enumerable secret is dropped; enumerable secret is kept`, () => {
      const encode = createJsonEncoder<Doc>(undefined, {strategy: encStrategy});
      const decode = createJsonDecoder<Doc>(undefined, {strategy: decStrategy});

      const hidden = decode(encode(withSecret(false)) as string) as Record<string, unknown>;
      expect(hidden.id).toBe('d1');
      expect(hidden.secret).toBeUndefined();

      const shown = decode(encode(withSecret(true)) as string) as Record<string, unknown>;
      expect(shown.id).toBe('d1');
      expect(shown.secret).toBe('shhh');
    });
  }

  it('binary round-trip honors the guard both ways', () => {
    const encode = createBinaryEncoder<Doc>();
    const decode = createBinaryDecoder<Doc>();
    expect((decode(encode(withSecret(false))) as Record<string, unknown>).secret).toBeUndefined();
    expect((decode(encode(withSecret(true))) as Record<string, unknown>).secret).toBe('shhh');
  });
});

describe('@nonEnumerable guard — validators treat guarded props as optional', () => {
  it('validate accepts a value missing the guarded prop', () => {
    const isDoc = createValidate<Doc>();
    expect(isDoc({id: 'd1'})).toBe(true); // secret absent
    expect(isDoc({id: 'd1', secret: 'x'})).toBe(true);
    expect(isDoc({id: 42})).toBe(false); // id still required + typed
  });

  it('getValidationErrors reports no error for a missing guarded prop', () => {
    const errorsOf = createGetValidationErrors<Doc>();
    expect(errorsOf({id: 'd1'})).toHaveLength(0);
  });

  it('validate(decode(encode(v))) holds for a non-enumerable value', () => {
    const isDoc = createValidate<Doc>();
    const encode = createJsonEncoder<Doc>();
    const decode = createJsonDecoder<Doc>();
    expect(isDoc(decode(encode(withSecret(false)) as string))).toBe(true);
  });
});

describe('@nonEnumerable guard — reflection', () => {
  it('exposes nonEnumerable + optional on the tagged member only', () => {
    const node = getRunType<Doc>();
    const kids = (node.children ?? []) as RunType[];
    const secret = kids.find((child) => child.name === 'secret');
    const id = kids.find((child) => child.name === 'id');
    expect(secret?.nonEnumerable).toBe(true);
    expect(secret?.optional).toBe(true);
    expect(id?.nonEnumerable).toBeFalsy();
    expect(id?.optional).toBeFalsy();
  });
});

// A framework error that deliberately makes name/message enumerable own props
// so the error envelope survives on the wire (the mion TypedError/RpcError
// pattern) — the class's responsibility once it extends a global.
class RpcError extends Error {
  constructor(
    public readonly code: number,
    msg: string
  ) {
    super(msg);
    Object.defineProperty(this, 'name', {value: 'RpcError', enumerable: true, writable: true, configurable: true});
    Object.defineProperty(this, 'message', {value: msg, enumerable: true, writable: true, configurable: true});
  }
}

describe('@nonEnumerable guard — framework opt-in keeps the envelope', () => {
  it('enumerable name/message ride the wire and round-trip', () => {
    const encode = createJsonEncoder<RpcError>();
    const decode = createJsonDecoder<RpcError>();
    const decoded = decode(encode(new RpcError(500, 'boom')) as string) as Record<string, unknown>;
    expect(decoded.code).toBe(500);
    expect(decoded.name).toBe('RpcError');
    expect(decoded.message).toBe('boom');
    expect(decoded.stack).toBeUndefined(); // still non-enumerable
  });

  it('marker: both getRunTypeId call shapes converge (hash equivalence)', () => {
    const staticId = getRunTypeId<RpcError>();
    const sample: RpcError = new RpcError(500, 'boom');
    expect(getRunTypeId(sample)).toBe(staticId);
  });
});

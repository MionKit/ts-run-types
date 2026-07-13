// Error subclasses as wire types, under the runtime-enumerability guard
// (docs/done/runtime-enumerability-checks-for-global-props.md, which SUPERSEDED
// the earlier hard `stack` exclusion). Members INHERITED from the default-lib
// `Error` global — `name`, `message`, `stack` (and `cause`) — are projected as
// NON-ENUMERABLE-GUARDED: the serializers gate their by-name write on a runtime
// own-enumerability check (`Object.prototype.propertyIsEnumerable`), i.e. exact
// `JSON.stringify` semantics. So a vanilla `class X extends Error` that never
// makes them enumerable ships NONE of them (no server stack-trace leak), while
// a value/class that defines one enumerably serializes it. Guarded members are
// also optional in the projected shape, so validators accept their absence.
//
// (Marker coverage rule: both getRunTypeId call shapes, converging + hash-equal.)

import {describe, expect, it} from 'vitest';
import {
  createValidate,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  getRunType,
  getRunTypeId,
  type RunType,
} from '@ts-runtypes/core';

// Vanilla: only the constructor-param property `code` is an enumerable own
// prop. `super(msg)` makes `message` a NON-enumerable own prop (Error's
// constructor uses a non-enumerable define), `stack` is engine-set
// non-enumerable, and `name` stays on the prototype (never an own prop).
class PlainError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

// Sets `this.name` — an ASSIGNMENT creates an enumerable own `name`, so this
// subclass DOES ship `name` (but still not `message`/`stack`).
class NamedError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'NamedError';
  }
}

function plain(): PlainError {
  const err = new PlainError('not-found', 'missing thing');
  expect(typeof err.stack).toBe('string'); // the instance genuinely carries one
  return err;
}

describe('Error subclass wire projection — enumerability guard', () => {
  it('reflected node keeps the inherited members, flagged nonEnumerable + optional', () => {
    const node = getRunType<PlainError>();
    const kids = (node.children ?? []) as RunType[];
    const by = (name: string) => kids.find((child) => child.name === name);
    // `stack` is no longer excluded — it is present as a guarded member.
    expect(by('code')).toBeTruthy();
    expect(by('name')).toBeTruthy();
    expect(by('message')).toBeTruthy();
    expect(by('stack')).toBeTruthy();
    // Inherited-global members are guarded + optional; the declared `code` is not.
    for (const name of ['name', 'message', 'stack']) {
      expect(by(name)?.nonEnumerable).toBe(true);
      expect(by(name)?.optional).toBe(true);
    }
    expect(by('code')?.nonEnumerable).toBeFalsy();
    expect(by('code')?.optional).toBeFalsy();
  });

  it('vanilla error → only enumerable own props ride the wire (native JSON semantics)', () => {
    const encode = createJsonEncoder<PlainError>();
    const err = plain();
    const parsed = JSON.parse(encode(err) as string);
    // Matches what native JSON.stringify emits for the declared props.
    expect(parsed).toEqual({code: 'not-found'});
    expect(JSON.parse(JSON.stringify(err))).toEqual({code: 'not-found'});
    expect(parsed.message).toBeUndefined();
    expect(parsed.name).toBeUndefined();
    expect(parsed.stack).toBeUndefined();
  });

  it('an enumerable own `name` (this.name = …) DOES ride the wire', () => {
    const encode = createJsonEncoder<NamedError>();
    const parsed = JSON.parse(encode(new NamedError('not-found', 'boom')) as string);
    expect(parsed.code).toBe('not-found');
    expect(parsed.name).toBe('NamedError');
    expect(parsed.message).toBeUndefined(); // super(msg) → still non-enumerable
    expect(parsed.stack).toBeUndefined();
  });

  it('a value that makes `stack` enumerable serializes it (per-value opt-in)', () => {
    const encode = createJsonEncoder<PlainError>();
    const err = plain();
    Object.defineProperty(err, 'stack', {value: 'FRAME', enumerable: true, writable: true, configurable: true});
    const parsed = JSON.parse(encode(err) as string);
    expect(parsed.stack).toBe('FRAME');
    expect(parsed.code).toBe('not-found');
  });

  it('binary round-trip carries only enumerable own props', () => {
    const encode = createBinaryEncoder<PlainError>();
    const decode = createBinaryDecoder<PlainError>();
    const decoded = decode(encode(plain())) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decoded.message).toBeUndefined();
    expect(decoded.stack).toBeUndefined();
  });

  it('inside a union, the error member still ships without stack', () => {
    type Result = PlainError | {ok: true};
    const encode = createJsonEncoder<Result>();
    const decode = createJsonDecoder<Result>();
    const json = encode(plain()) as string;
    expect(json).not.toContain('stack');
    const decoded = decode(json) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decode(encode({ok: true}) as string)).toEqual({ok: true});
  });

  it('validate accepts wire-shaped values missing the guarded members', () => {
    const isError = createValidate<PlainError>();
    expect(isError(plain())).toBe(true);
    expect(isError({code: 'x'})).toBe(true); // name/message/stack all absent
    // validate(decode(encode(v))) holds for a vanilla instance.
    const encode = createJsonEncoder<PlainError>();
    const decode = createJsonDecoder<PlainError>();
    expect(isError(decode(encode(plain()) as string))).toBe(true);
  });

  it('(static + reflect) both getRunTypeId call shapes converge', () => {
    const staticId = getRunTypeId<PlainError>();
    const sample: PlainError = plain();
    expect(getRunTypeId(sample)).toBe(staticId); // hash equivalence
  });
});

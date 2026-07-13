// Error subclasses as wire types: the `stack` member inherited from the
// default-lib Error interface is EXCLUDED from class projections (see
// docs/done/error-subclass-projections-leak-stack.md) — emitters materialize
// declared props by name, so without the exclusion every
// `class MyError extends Error {…}` shipped server stack traces (absolute
// paths + call frames) to clients by default. `name`/`message` stay: they are
// real error-envelope data with no leak potential.
//
// (Marker coverage rule: both getRunTypeId call shapes, converging.)

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

class WireCodeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'WireCodeError';
  }
}

function makeError(): WireCodeError {
  const err = new WireCodeError('not-found', 'missing thing');
  expect(typeof err.stack).toBe('string'); // the instance genuinely carries one
  return err;
}

describe('Error subclass wire projection — no stack on the wire', () => {
  it('reflected node keeps declared + envelope members but not lib stack', () => {
    const node = getRunType<WireCodeError>();
    const names = (node.children ?? []).map((child) => (child as RunType).name);
    expect(names).toContain('code');
    expect(names).toContain('name');
    expect(names).toContain('message');
    expect(names).not.toContain('stack');
  });

  it('(static + reflect) both getRunTypeId call shapes converge', () => {
    const staticId = getRunTypeId<WireCodeError>();
    const sample: WireCodeError = makeError();
    expect(getRunTypeId(sample)).toBe(staticId);
  });

  it('JSON encoding writes code/name/message but never stack', () => {
    const encode = createJsonEncoder<WireCodeError>();
    const json = encode(makeError()) as string;
    const parsed = JSON.parse(json);
    expect(parsed.code).toBe('not-found');
    expect(parsed.name).toBe('WireCodeError');
    expect(parsed.message).toBe('missing thing');
    expect(json).not.toContain('stack');
    expect(parsed.stack).toBeUndefined();
  });

  it('binary round-trip carries declared data, never stack', () => {
    const encode = createBinaryEncoder<WireCodeError>();
    const decode = createBinaryDecoder<WireCodeError>();
    const decoded = decode(encode(makeError())) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decoded.message).toBe('missing thing');
    expect(decoded.stack).toBeUndefined();
  });

  it('inside a union, the error member still ships without stack', () => {
    type Result = WireCodeError | {ok: true};
    const encode = createJsonEncoder<Result>();
    const decode = createJsonDecoder<Result>();
    const json = encode(makeError()) as string;
    expect(json).not.toContain('stack');
    const decoded = decode(json) as Record<string, unknown>;
    expect(decoded.code).toBe('not-found');
    expect(decode(encode({ok: true}) as string)).toEqual({ok: true});
  });

  it('validate accepts wire-shaped values with no stack key (stack is not part of the shape)', () => {
    const isWireError = createValidate<WireCodeError>();
    expect(isWireError(makeError())).toBe(true);
    expect(isWireError({code: 'x', name: 'WireCodeError', message: 'm'})).toBe(true);
  });
});

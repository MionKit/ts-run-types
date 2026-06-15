// Regression for the bug the fuzzer surfaced: createBinaryEncoder owns its
// serializer and sizes it from adaptive history (predictBufferSize). After
// many small encodes the predicted size converges down to ~2x the running
// average, so an above-average string used to overflow the buffer and throw
// `RangeError: buffer too small to encode string … Call resize() and retry.`
// instead of growing. The encoder now performs that grow-and-retry itself.

import {describe, it, expect} from 'vitest';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {createBinaryEncoder, createBinaryDecoder} from '@mionjs/ts-go-run-types';

describe('fuzz / regression — binary encoder grows its buffer on overflow', () => {
  it('encodes an above-average string after the size history converged down', () => {
    const schema = RT.object({s: RT.string()});
    const encode = createBinaryEncoder(schema);
    const decode = createBinaryDecoder(schema);

    // Drive the adaptive size history down with many tiny payloads.
    for (let i = 0; i < 50; i++) encode({s: ''});

    // A string far larger than the converged prediction — used to throw.
    const big = {s: 'x'.repeat(10_000)};
    expect(() => encode(big)).not.toThrow();
    expect(decode(encode(big))).toEqual(big);

    // Encoder stays correct for small payloads afterwards too.
    expect(decode(encode({s: 'hi'}))).toEqual({s: 'hi'});
  });
});

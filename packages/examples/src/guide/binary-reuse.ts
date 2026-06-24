import {createBinaryEncoder, createBinaryDecoder, createBinarySizer} from 'ts-runtypes';

type Tick = {symbol: string; price: number};

// start-reuse
// In a hot loop, allocate one buffer and reuse it. With sizeStrategy 'into' the
// encoder writes into YOUR buffer and returns a zero-copy view, so there is no
// fresh allocation per call. createBinarySizer gives a safe size to allocate.
const encode = createBinaryEncoder<Tick>(undefined, {sizeStrategy: 'into'});
const decode = createBinaryDecoder<Tick>();
const sizeOf = createBinarySizer<Tick>();

const ticks: Tick[] = [
  {symbol: 'TS', price: 7},
  {symbol: 'GO', price: 9},
];

const buffer = new ArrayBuffer(Math.max(...ticks.map(sizeOf)));

for (const tick of ticks) {
  const view = encode(tick, buffer); // a Uint8Array view into `buffer`
  decode(view); // consume the view before the next encode reuses the buffer
}
// end-reuse

const firstTick = decode(encode(ticks[0], buffer));

export {encode, decode, firstTick};

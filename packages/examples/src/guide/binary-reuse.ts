import {createBinaryEncoder, createBinaryDecoder, createDataViewSerializer, createDataViewDeserializer} from '@mionjs/ts-go-run-types';

type Tick = {symbol: string; price: number};

const encode = createBinaryEncoder<Tick>();
const decode = createBinaryDecoder<Tick>();

// start-reuse
// In a hot loop, build the serializer once and hand it to the encoder so it
// reuses the same backing buffer instead of allocating a fresh one each call.
const ser = createDataViewSerializer('ticks');

for (const tick of [{symbol: 'TS', price: 7}, {symbol: 'GO', price: 9}]) {
  const buffer = encode(tick, ser); // writes into the shared serializer
  // ...send `buffer`
}

// Same idea on the way back — reuse a deserializer for a known buffer.
const des = createDataViewDeserializer('ticks', encode({symbol: 'TS', price: 7}));
const tick = decode(des);
// end-reuse

export {tick};

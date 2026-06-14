import {createBinaryEncoder, createBinaryDecoder, createDataViewSerializer, createDataViewDeserializer} from '@mionjs/ts-go-run-types';

type Tick = {symbol: string; price: number};

const encode = createBinaryEncoder<Tick>();
const decode = createBinaryDecoder<Tick>();

// start-reuse
// In a hot loop, build the serializer once and hand it to the encoder so it
// reuses the same backing buffer instead of allocating a fresh one each call.
const ser = createDataViewSerializer('ticks');
const ticks: Tick[] = [{symbol: 'TS', price: 7}, {symbol: 'GO', price: 9}];

const buffers = ticks.map((tick) => encode(tick, ser)); // writes into the shared serializer

// Same idea on the way back — reuse a deserializer for a known buffer.
const des = createDataViewDeserializer('ticks', buffers[0]);
const firstTick = decode(des);
// end-reuse

export {buffers, firstTick};

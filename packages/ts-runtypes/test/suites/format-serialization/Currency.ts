// Currency serialization cases — the brand delegates its wire behaviour to the
// number family: JSON writes the plain number; binary reuses the numberFormat
// integer ladder, so integer minor-unit bounds pack into the narrowest int and
// an unconstrained amount rides the base float64 arm.
import * as TF from 'ts-runtypes/formats';
import type {SerializationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';

export const CURRENCY = {
  currency_amount: {
    title: 'Currency amount (float64)',
    description:
      'JSON + binary (de)serialization of an unconstrained TF.Currency; no integer bounds, so binary rides the base 8-byte float64 arm while JSON writes the plain number.',
    serializeNotes: 'The currency brand never touches the wire — values serialize exactly like the equivalent plain number.',
    mutateEncoder: () => createJsonEncoder<TF.Currency>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.Currency>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.Currency>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<TF.Currency>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TF.Currency>(),
    preserveDecoder: () => createJsonDecoder<TF.Currency>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<TF.Currency>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TF.Currency>(),
    binaryDecoder: () => createBinaryDecoder<TF.Currency>(),
    schemaEncoder: () => createJsonEncoder(TF.currency()),
    schemaDecoder: () => createJsonDecoder(TF.currency()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.currency()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.currency()),
    getTestData: () => ({values: [19.99, 0, -1234.56]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
  currency_minor_units: {
    title: 'Currency minor units (uint16)',
    description:
      'JSON + binary (de)serialization of TF.Currency<{integer:true; min:0; max:65535}> (cents); the uint16 bounds select the 2-byte binary encoding via the shared number-format ladder.',
    serializeNotes:
      'Format-aware binary width: the [0, 65535] integer bounds pin every value to 2 bytes (getBinaryByteSizes [2,2,2]); JSON is lossless plain-number text.',
    mutateEncoder: () => createJsonEncoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    preserveDecoder: () => createJsonDecoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    binaryDecoder: () => createBinaryDecoder<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    schemaEncoder: () => createJsonEncoder(TF.currency({integer: true, min: 0, max: 65535})),
    schemaDecoder: () => createJsonDecoder(TF.currency({integer: true, min: 0, max: 65535})),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.currency({integer: true, min: 0, max: 65535})),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.currency({integer: true, min: 0, max: 65535})),
    getTestData: () => ({values: [0, 1999, 65535]}),
    getBinaryByteSizes: () => [2, 2, 2],
  },
} as const satisfies Record<string, SerializationCase>;

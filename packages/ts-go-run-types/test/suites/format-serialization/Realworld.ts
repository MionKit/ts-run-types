import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatEmail, FormatUUIDv4} from '@mionjs/ts-go-run-types/formats';

// Real-world DTOs whose fields carry type-formats, taken to the wire. A format brand
// (uuid / email) constrains validation only — on the wire it is the plain underlying
// string — so the JSON and binary round-trips are symmetric. The order adds a `Date`
// (placedAt) that survives the JSON trip and packs into binary. Every thunk is
// SELF-DECLARING: the `interface` (with its branded format fields) is written inside
// the thunk body, so the doc-gen extracts a real, self-contained snippet.

export const REALWORLD = {
  user: {
    title: 'user',
    description: 'A DTO whose id is a `FormatUUIDv4` and email a `FormatEmail`. Both brands serialise as their plain underlying string, so the round-trip is symmetric on every strategy.',
    serializeNotes: 'Format brands are a validation-time constraint only — on the wire they are plain strings.',
    mutateEncoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createJsonEncoder<User>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createJsonEncoder<User>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createJsonEncoder<User>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createJsonDecoder<User>();
    },
    preserveDecoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createJsonDecoder<User>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createBinaryEncoder<User>();
    },
    binaryDecoder: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createBinaryDecoder<User>();
    },
    schemaEncoder: () => createJsonEncoder(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    schemaDecoder: () => createJsonDecoder(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    getTestData: () => ({
      values: [
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada Lovelace', email: 'ada@example.com'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', name: 'Grace Hopper', email: 'grace@example.com'},
      ],
    }),
  },

  order: {
    title: 'order',
    description: 'A DTO mixing two formats (a `FormatUUIDv4` id and a `FormatEmail` contact) with a numeric total, a `Date` (placedAt) and a string-literal status union.',
    serializeNotes: [
      '`placedAt` serialises to an ISO string and restores to a real `Date`.',
      'The uuid / email brands round-trip as plain strings through both JSON and binary.',
    ],
    mutateEncoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createJsonEncoder<Order>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createJsonEncoder<Order>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createJsonEncoder<Order>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createJsonDecoder<Order>();
    },
    preserveDecoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createJsonDecoder<Order>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createBinaryEncoder<Order>();
    },
    binaryDecoder: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; placedAt: Date; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createBinaryDecoder<Order>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          placedAt: RT.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          placedAt: RT.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          placedAt: RT.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          placedAt: RT.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    getTestData: () => ({
      values: [
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'ada@example.com', total: 78, placedAt: new Date('2024-01-02T03:04:05.000Z'), status: 'paid'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', email: 'grace@example.com', total: 0, placedAt: new Date('2024-06-15T00:00:00.000Z'), status: 'pending'},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;

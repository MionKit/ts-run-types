import * as TF from 'ts-runtypes/formats';
import type {SerializationCase} from './types.ts';
import * as RT from 'ts-runtypes/schema';
import 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';

// Real-world DTOs whose fields carry type-formats, taken to the wire. A format brand
// (uuid / email) constrains validation only — on the wire it is the plain underlying
// string — so the JSON and binary round-trips are symmetric. The order adds a `Date`
// (placedAt) that survives the JSON trip and packs into binary. Every thunk is
// SELF-DECLARING: the `interface` (with its branded format fields) is written inside
// the thunk body, so the doc-gen extracts a real, self-contained snippet.

export const REALWORLD = {
  user: {
    title: 'User',
    description:
      'A DTO whose id is a `TF.UUIDv4` and email a `TF.Email`, both serialising as their plain underlying string so the round-trip is symmetric on every strategy.',
    serializeNotes: 'Format brands are a validation-time constraint only — on the wire they are plain strings.',
    mutateEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoder<User>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoder<User>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonEncoder<User>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonDecoder<User>();
    },
    preserveDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createJsonDecoder<User>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createBinaryEncoder<User>();
    },
    binaryDecoder: () => {
      interface User {
        id: TF.UUIDv4;
        name: string;
        email: TF.Email;
      }
      return createBinaryDecoder<User>();
    },
    schemaEncoder: () => createJsonEncoder(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaDecoder: () => createJsonDecoder(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({id: TF.uuidv4(), name: TF.string(), email: TF.email()})),
    getTestData: () => ({
      values: [
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada Lovelace', email: 'ada@example.com'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', name: 'Grace Hopper', email: 'grace@example.com'},
      ],
    }),
  },

  order: {
    title: 'Order',
    description:
      'A DTO mixing two formats, a `TF.UUIDv4` id and a `TF.Email` contact, with a numeric total, a `Date` placedAt and a string-literal status union.',
    serializeNotes: [
      '`placedAt` serialises to an ISO string and restores to a real `Date`.',
      'The uuid / email brands round-trip as plain strings through both JSON and binary.',
    ],
    mutateEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoder<Order>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoder<Order>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonEncoder<Order>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonDecoder<Order>();
    },
    preserveDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createJsonDecoder<Order>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createBinaryEncoder<Order>();
    },
    binaryDecoder: () => {
      interface Order {
        id: TF.UUIDv4;
        email: TF.Email;
        total: number;
        placedAt: Date;
        status: 'pending' | 'paid' | 'shipped' | 'cancelled';
      }
      return createBinaryDecoder<Order>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          id: TF.uuidv4(),
          email: TF.email(),
          total: TF.number(),
          placedAt: TF.date(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    getTestData: () => ({
      values: [
        {
          id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff',
          email: 'ada@example.com',
          total: 78,
          placedAt: new Date('2024-01-02T03:04:05.000Z'),
          status: 'paid',
        },
        {
          id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f',
          email: 'grace@example.com',
          total: 0,
          placedAt: new Date('2024-06-15T00:00:00.000Z'),
          status: 'pending',
        },
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;

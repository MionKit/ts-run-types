import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const LARGE_OBJECTS = {
  wide_interface: {
    title: 'wide interface — 30 mixed-type properties',
    description:
      'Single interface with 30+ properties spanning scalars, Date, bigint, nested object — exercises the per-field walk cost without any union dispatch.',
    serializeNotes:
      'The Date fields (`createdAt`/`updatedAt` and nested `meta.lastSeen`) JSON-encode to ISO strings and revive to Dates; the `big1`/`big2` bigints encode to decimal strings (rebuilt via `BigInt(...)`) on the JSON wire and take the binary string-fallback path.',
    mutateEncoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createJsonEncoder<WideRecord>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createJsonEncoder<WideRecord>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createJsonEncoder<WideRecord>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createJsonDecoder<WideRecord>();
    },
    preserveDecoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createJsonDecoder<WideRecord>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createBinaryEncoder<WideRecord>();
    },
    binaryDecoder: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      return createBinaryDecoder<WideRecord>();
    },
    // WideRecord — 30 mixed-type props incl. Date, bigint, and a nested meta object.
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          id: RT.number(),
          name: RT.string(),
          description: RT.string(),
          createdAt: RT.date(),
          updatedAt: RT.date(),
          isActive: RT.boolean(),
          score: RT.number(),
          rank: RT.number(),
          tag1: RT.string(),
          tag2: RT.string(),
          tag3: RT.string(),
          tag4: RT.string(),
          tag5: RT.string(),
          count1: RT.number(),
          count2: RT.number(),
          count3: RT.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: RT.bigint(),
          big2: RT.bigint(),
          alias: RT.string(),
          email: RT.string(),
          city: RT.string(),
          country: RT.string(),
          postal: RT.string(),
          width: RT.number(),
          height: RT.number(),
          weight: RT.number(),
          meta: RT.object({category: RT.string(), priority: RT.number(), lastSeen: RT.date()}),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          id: RT.number(),
          name: RT.string(),
          description: RT.string(),
          createdAt: RT.date(),
          updatedAt: RT.date(),
          isActive: RT.boolean(),
          score: RT.number(),
          rank: RT.number(),
          tag1: RT.string(),
          tag2: RT.string(),
          tag3: RT.string(),
          tag4: RT.string(),
          tag5: RT.string(),
          count1: RT.number(),
          count2: RT.number(),
          count3: RT.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: RT.bigint(),
          big2: RT.bigint(),
          alias: RT.string(),
          email: RT.string(),
          city: RT.string(),
          country: RT.string(),
          postal: RT.string(),
          width: RT.number(),
          height: RT.number(),
          weight: RT.number(),
          meta: RT.object({category: RT.string(), priority: RT.number(), lastSeen: RT.date()}),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          id: RT.number(),
          name: RT.string(),
          description: RT.string(),
          createdAt: RT.date(),
          updatedAt: RT.date(),
          isActive: RT.boolean(),
          score: RT.number(),
          rank: RT.number(),
          tag1: RT.string(),
          tag2: RT.string(),
          tag3: RT.string(),
          tag4: RT.string(),
          tag5: RT.string(),
          count1: RT.number(),
          count2: RT.number(),
          count3: RT.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: RT.bigint(),
          big2: RT.bigint(),
          alias: RT.string(),
          email: RT.string(),
          city: RT.string(),
          country: RT.string(),
          postal: RT.string(),
          width: RT.number(),
          height: RT.number(),
          weight: RT.number(),
          meta: RT.object({category: RT.string(), priority: RT.number(), lastSeen: RT.date()}),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          id: RT.number(),
          name: RT.string(),
          description: RT.string(),
          createdAt: RT.date(),
          updatedAt: RT.date(),
          isActive: RT.boolean(),
          score: RT.number(),
          rank: RT.number(),
          tag1: RT.string(),
          tag2: RT.string(),
          tag3: RT.string(),
          tag4: RT.string(),
          tag5: RT.string(),
          count1: RT.number(),
          count2: RT.number(),
          count3: RT.number(),
          flag1: RT.boolean(),
          flag2: RT.boolean(),
          flag3: RT.boolean(),
          big1: RT.bigint(),
          big2: RT.bigint(),
          alias: RT.string(),
          email: RT.string(),
          city: RT.string(),
          country: RT.string(),
          postal: RT.string(),
          width: RT.number(),
          height: RT.number(),
          weight: RT.number(),
          meta: RT.object({category: RT.string(), priority: RT.number(), lastSeen: RT.date()}),
        })
      ),
    getTestData: () => {
      interface WideRecord {
        id: number;
        name: string;
        description: string;
        createdAt: Date;
        updatedAt: Date;
        isActive: boolean;
        score: number;
        rank: number;
        tag1: string;
        tag2: string;
        tag3: string;
        tag4: string;
        tag5: string;
        count1: number;
        count2: number;
        count3: number;
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
        big1: bigint;
        big2: bigint;
        alias: string;
        email: string;
        city: string;
        country: string;
        postal: string;
        width: number;
        height: number;
        weight: number;
        meta: {category: string; priority: number; lastSeen: Date};
      }
      const seed = 1;
      const record: WideRecord = {
        id: seed,
        name: `record-${seed}`,
        description: `Description for record ${seed} with extra body text`,
        createdAt: new Date('2024-01-15T12:00:00.000Z'),
        updatedAt: new Date('2024-06-15T12:00:00.000Z'),
        isActive: true,
        score: seed * 1.5,
        rank: seed % 100,
        tag1: `tag-a-${seed}`,
        tag2: `tag-b-${seed}`,
        tag3: `tag-c-${seed}`,
        tag4: `tag-d-${seed}`,
        tag5: `tag-e-${seed}`,
        count1: seed * 2,
        count2: seed * 3,
        count3: seed * 4,
        flag1: seed % 2 === 0,
        flag2: seed % 3 === 0,
        flag3: seed % 5 === 0,
        big1: BigInt(seed) * 1_000_000n,
        big2: BigInt(seed) * 9_999_999n,
        alias: `alias-${seed}`,
        email: `user${seed}@example.com`,
        city: 'Springfield',
        country: 'XX',
        postal: '00000',
        width: 1024,
        height: 768,
        weight: 12.5,
        meta: {category: 'default', priority: seed % 10, lastSeen: new Date('2024-12-01T00:00:00.000Z')},
      };
      return {values: [record]};
    },
  },
  object_union_5: {
    title: 'discriminated union of 5 large object members',
    description:
      'Five-member union of distinct event shapes. The flat encoder should win clearly here — non-flat runs an validate walk per candidate member.',
    mutateEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createJsonDecoder<LargeObjectUnion>();
    },
    preserveDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createJsonDecoder<LargeObjectUnion>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createBinaryEncoder<LargeObjectUnion>();
    },
    binaryDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      interface OrderEvent {
        kind: 'order';
        id: string;
        total: number;
        itemCount: number;
        placedAt: Date;
        shipped: boolean;
        customerId: string;
      }
      interface PaymentEvent {
        kind: 'payment';
        id: string;
        amount: number;
        currency: string;
        processedAt: Date;
        refunded: boolean;
        txId: string;
      }
      interface SessionEvent {
        kind: 'session';
        id: string;
        userId: string;
        startedAt: Date;
        durationMs: number;
        ipHash: string;
        device: string;
      }
      type LargeObjectUnion = ProductEvent | UserEvent | OrderEvent | PaymentEvent | SessionEvent;
      return createBinaryDecoder<LargeObjectUnion>();
    },
    // Five-member discriminated union, each arm keyed by its `kind` literal.
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: RT.string(),
            total: RT.number(),
            itemCount: RT.number(),
            placedAt: RT.date(),
            shipped: RT.boolean(),
            customerId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: RT.string(),
            amount: RT.number(),
            currency: RT.string(),
            processedAt: RT.date(),
            refunded: RT.boolean(),
            txId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: RT.string(),
            userId: RT.string(),
            startedAt: RT.date(),
            durationMs: RT.number(),
            ipHash: RT.string(),
            device: RT.string(),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: RT.string(),
            total: RT.number(),
            itemCount: RT.number(),
            placedAt: RT.date(),
            shipped: RT.boolean(),
            customerId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: RT.string(),
            amount: RT.number(),
            currency: RT.string(),
            processedAt: RT.date(),
            refunded: RT.boolean(),
            txId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: RT.string(),
            userId: RT.string(),
            startedAt: RT.date(),
            durationMs: RT.number(),
            ipHash: RT.string(),
            device: RT.string(),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: RT.string(),
            total: RT.number(),
            itemCount: RT.number(),
            placedAt: RT.date(),
            shipped: RT.boolean(),
            customerId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: RT.string(),
            amount: RT.number(),
            currency: RT.string(),
            processedAt: RT.date(),
            refunded: RT.boolean(),
            txId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: RT.string(),
            userId: RT.string(),
            startedAt: RT.date(),
            durationMs: RT.number(),
            ipHash: RT.string(),
            device: RT.string(),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
          RT.object({
            kind: RT.literal('order'),
            id: RT.string(),
            total: RT.number(),
            itemCount: RT.number(),
            placedAt: RT.date(),
            shipped: RT.boolean(),
            customerId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('payment'),
            id: RT.string(),
            amount: RT.number(),
            currency: RT.string(),
            processedAt: RT.date(),
            refunded: RT.boolean(),
            txId: RT.string(),
          }),
          RT.object({
            kind: RT.literal('session'),
            id: RT.string(),
            userId: RT.string(),
            startedAt: RT.date(),
            durationMs: RT.number(),
            ipHash: RT.string(),
            device: RT.string(),
          }),
        ])
      ),
    getTestData: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      return {
        values: [
          {
            kind: 'product',
            id: 'p-1',
            sku: 'SKU-001',
            price: 19.99,
            available: true,
            releasedAt: new Date('2024-02-01T00:00:00.000Z'),
            stock: 42,
          } satisfies ProductEvent,
        ],
      };
    },
  },
  mixed_union_atomic_and_large_objects: {
    title: 'mixed union — atomic + large object members',
    description:
      'string | number | ProductEvent | UserEvent — exercises the flat encoder atomic short-circuit alongside the merged-object envelope.',
    mutateEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonDecoder<MixedLargeUnion>();
    },
    preserveDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createJsonDecoder<MixedLargeUnion>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createBinaryEncoder<MixedLargeUnion>();
    },
    binaryDecoder: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      interface UserEvent {
        kind: 'user';
        id: string;
        username: string;
        email: string;
        signedUpAt: Date;
        loginCount: number;
        isPremium: boolean;
      }
      type MixedLargeUnion = string | number | ProductEvent | UserEvent;
      return createBinaryDecoder<MixedLargeUnion>();
    },
    // Mixed union — two atomic members alongside two large object arms.
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.string(),
          RT.number(),
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.string(),
          RT.number(),
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.string(),
          RT.number(),
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.string(),
          RT.number(),
          RT.object({
            kind: RT.literal('product'),
            id: RT.string(),
            sku: RT.string(),
            price: RT.number(),
            available: RT.boolean(),
            releasedAt: RT.date(),
            stock: RT.number(),
          }),
          RT.object({
            kind: RT.literal('user'),
            id: RT.string(),
            username: RT.string(),
            email: RT.string(),
            signedUpAt: RT.date(),
            loginCount: RT.number(),
            isPremium: RT.boolean(),
          }),
        ])
      ),
    getTestData: () => {
      interface ProductEvent {
        kind: 'product';
        id: string;
        sku: string;
        price: number;
        available: boolean;
        releasedAt: Date;
        stock: number;
      }
      return {
        values: [
          {
            kind: 'product',
            id: 'p-9',
            sku: 'SKU-999',
            price: 49.5,
            available: false,
            releasedAt: new Date('2024-04-10T00:00:00.000Z'),
            stock: 0,
          } satisfies ProductEvent,
        ],
      };
    },
  },
  deep_nested: {
    title: 'five-level deeply nested object with arrays of objects',
    description: 'Walks five levels of nested arrays of objects to amplify per-property overhead.',
    mutateEncoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createJsonDecoder<DeepNestedLevel1>();
    },
    preserveDecoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createJsonDecoder<DeepNestedLevel1>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createBinaryEncoder<DeepNestedLevel1>();
    },
    binaryDecoder: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      return createBinaryDecoder<DeepNestedLevel1>();
    },
    // Five levels of nested objects, each level holding an array of the next.
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          root: RT.string(),
          categories: RT.array(
            RT.object({
              category: RT.string(),
              groups: RT.array(
                RT.object({
                  group: RT.string(),
                  branches: RT.array(
                    RT.object({
                      label: RT.string(),
                      children: RT.array(
                        RT.object({
                          name: RT.string(),
                          leaves: RT.array(RT.object({id: RT.number(), value: RT.string(), when: RT.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          root: RT.string(),
          categories: RT.array(
            RT.object({
              category: RT.string(),
              groups: RT.array(
                RT.object({
                  group: RT.string(),
                  branches: RT.array(
                    RT.object({
                      label: RT.string(),
                      children: RT.array(
                        RT.object({
                          name: RT.string(),
                          leaves: RT.array(RT.object({id: RT.number(), value: RT.string(), when: RT.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          root: RT.string(),
          categories: RT.array(
            RT.object({
              category: RT.string(),
              groups: RT.array(
                RT.object({
                  group: RT.string(),
                  branches: RT.array(
                    RT.object({
                      label: RT.string(),
                      children: RT.array(
                        RT.object({
                          name: RT.string(),
                          leaves: RT.array(RT.object({id: RT.number(), value: RT.string(), when: RT.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          root: RT.string(),
          categories: RT.array(
            RT.object({
              category: RT.string(),
              groups: RT.array(
                RT.object({
                  group: RT.string(),
                  branches: RT.array(
                    RT.object({
                      label: RT.string(),
                      children: RT.array(
                        RT.object({
                          name: RT.string(),
                          leaves: RT.array(RT.object({id: RT.number(), value: RT.string(), when: RT.date()})),
                        })
                      ),
                    })
                  ),
                })
              ),
            })
          ),
        })
      ),
    getTestData: () => {
      interface DeepNestedLeaf {
        id: number;
        value: string;
        when: Date;
      }
      interface DeepNestedLevel5 {
        name: string;
        leaves: DeepNestedLeaf[];
      }
      interface DeepNestedLevel4 {
        label: string;
        children: DeepNestedLevel5[];
      }
      interface DeepNestedLevel3 {
        group: string;
        branches: DeepNestedLevel4[];
      }
      interface DeepNestedLevel2 {
        category: string;
        groups: DeepNestedLevel3[];
      }
      interface DeepNestedLevel1 {
        root: string;
        categories: DeepNestedLevel2[];
      }
      const leaf: DeepNestedLeaf = {id: 1, value: 'leaf', when: new Date('2024-01-01T00:00:00.000Z')};
      const level5: DeepNestedLevel5 = {name: 'l5', leaves: [leaf, leaf, leaf]};
      const level4: DeepNestedLevel4 = {label: 'l4', children: [level5, level5]};
      const level3: DeepNestedLevel3 = {group: 'l3', branches: [level4, level4]};
      const level2: DeepNestedLevel2 = {category: 'l2', groups: [level3, level3]};
      const level1: DeepNestedLevel1 = {root: 'l1', categories: [level2, level2]};
      return {values: [level1]};
    },
  },
  large_class_union: {
    title: 'discriminated union of three large class instances',
    description: 'Three-member class union — restore decodes to plain objects (class instances do not survive JSON round-trip).',
    serializeNotes:
      'Members are picked by the `kind` discriminant (`classA`/`classB`/`classC`); each carries Date (`when`/`releasedAt`/`processedAt`, ISO-string on the wire) and bigint (`total`/`score`, decimal-string on the wire) members, and decode returns plain objects rather than the original class instances.',
    mutateEncoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createJsonDecoder<LargeClassUnion>();
    },
    preserveDecoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createJsonDecoder<LargeClassUnion>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createBinaryEncoder<LargeClassUnion>();
    },
    binaryDecoder: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      class LargeClassB {
        kind!: 'classB';
        beta!: string;
        ratio!: number;
        enabled!: boolean;
        releasedAt!: Date;
        score!: bigint;
        metadata!: {label: string; weight: number};
      }
      class LargeClassC {
        kind!: 'classC';
        gamma!: string;
        amount!: number;
        paid!: boolean;
        processedAt!: Date;
        txId!: string;
        steps!: number[];
      }
      type LargeClassUnion = LargeClassA | LargeClassB | LargeClassC;
      return createBinaryDecoder<LargeClassUnion>();
    },
    // Three-member class union modelled by its serialisable data shape
    // (class instances decode to plain objects), keyed by the `kind` literal.
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: RT.string(),
            count: RT.number(),
            flag: RT.boolean(),
            when: RT.date(),
            total: RT.bigint(),
            tags: RT.array(RT.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: RT.string(),
            ratio: RT.number(),
            enabled: RT.boolean(),
            releasedAt: RT.date(),
            score: RT.bigint(),
            metadata: RT.object({label: RT.string(), weight: RT.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: RT.string(),
            amount: RT.number(),
            paid: RT.boolean(),
            processedAt: RT.date(),
            txId: RT.string(),
            steps: RT.array(RT.number()),
          }),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: RT.string(),
            count: RT.number(),
            flag: RT.boolean(),
            when: RT.date(),
            total: RT.bigint(),
            tags: RT.array(RT.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: RT.string(),
            ratio: RT.number(),
            enabled: RT.boolean(),
            releasedAt: RT.date(),
            score: RT.bigint(),
            metadata: RT.object({label: RT.string(), weight: RT.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: RT.string(),
            amount: RT.number(),
            paid: RT.boolean(),
            processedAt: RT.date(),
            txId: RT.string(),
            steps: RT.array(RT.number()),
          }),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: RT.string(),
            count: RT.number(),
            flag: RT.boolean(),
            when: RT.date(),
            total: RT.bigint(),
            tags: RT.array(RT.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: RT.string(),
            ratio: RT.number(),
            enabled: RT.boolean(),
            releasedAt: RT.date(),
            score: RT.bigint(),
            metadata: RT.object({label: RT.string(), weight: RT.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: RT.string(),
            amount: RT.number(),
            paid: RT.boolean(),
            processedAt: RT.date(),
            txId: RT.string(),
            steps: RT.array(RT.number()),
          }),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({
            kind: RT.literal('classA'),
            alpha: RT.string(),
            count: RT.number(),
            flag: RT.boolean(),
            when: RT.date(),
            total: RT.bigint(),
            tags: RT.array(RT.string()),
          }),
          RT.object({
            kind: RT.literal('classB'),
            beta: RT.string(),
            ratio: RT.number(),
            enabled: RT.boolean(),
            releasedAt: RT.date(),
            score: RT.bigint(),
            metadata: RT.object({label: RT.string(), weight: RT.number()}),
          }),
          RT.object({
            kind: RT.literal('classC'),
            gamma: RT.string(),
            amount: RT.number(),
            paid: RT.boolean(),
            processedAt: RT.date(),
            txId: RT.string(),
            steps: RT.array(RT.number()),
          }),
        ])
      ),
    getTestData: () => {
      class LargeClassA {
        kind!: 'classA';
        alpha!: string;
        count!: number;
        flag!: boolean;
        when!: Date;
        total!: bigint;
        tags!: string[];
      }
      const a = new LargeClassA();
      a.kind = 'classA';
      a.alpha = 'alpha-value';
      a.count = 42;
      a.flag = true;
      a.when = new Date('2024-03-15T08:30:00.000Z');
      a.total = 10_000n;
      a.tags = ['x', 'y', 'z'];
      return {
        values: [a],
        deserializedValues: [{...a}],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;

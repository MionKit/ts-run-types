import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const LARGE_OBJECTS = {
  wide_interface: {
    title: 'wide interface — 30 mixed-type properties',
    description:
      'Single interface with 30+ properties spanning scalars, Date, bigint, nested object — exercises the per-field walk cost without any union dispatch.',
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
    stripMutateEncoder: () => {
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
      return createJsonEncoder<WideRecord>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
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
      return createJsonEncoder<WideRecord>();
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
      'Five-member union of distinct event shapes. The flat encoder should win clearly here — non-flat runs an isType walk per candidate member.',
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
    stripMutateEncoder: () => {
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
      return createJsonEncoder<LargeObjectUnion>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
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
      return createJsonEncoder<LargeObjectUnion>();
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
    stripMutateEncoder: () => {
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
      return createJsonEncoder<MixedLargeUnion>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
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
      return createJsonEncoder<MixedLargeUnion>();
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
    stripMutateEncoder: () => {
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
      return createJsonEncoder<DeepNestedLevel1>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
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
      return createJsonEncoder<DeepNestedLevel1>();
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
    stripMutateEncoder: () => {
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
      return createJsonEncoder<LargeClassUnion>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
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
      return createJsonEncoder<LargeClassUnion>();
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

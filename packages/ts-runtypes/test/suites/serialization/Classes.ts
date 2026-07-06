// Registered user classes run through the full serialization strategy matrix
// (mutate / clone / direct / compact × strip / preserve, plus binary). Decode
// reconstructs a real instance; the suite asserts the DATA round-trips through
// every strategy (the reconstruction / `instanceof` guarantees are pinned in
// test/features/classSerializer*.test.ts). Value-first schema is 'not-supported'
// (a class is not an `RT.*` model), so the id-integrity driver skips it.
//
// NOTE: every class type is defined INSIDE each thunk (never module scope), even
// though the class + register call repeats — the website doc pipeline extracts
// each thunk as a standalone, self-contained code sample. Same convention as
// `LargeObjects.large_class_union`.
import {
  registerClassSerializer,
  createBinaryDecoder,
  createBinaryEncoder,
  createJsonDecoder,
  createJsonEncoder,
} from 'ts-runtypes';
import type {SerializationCase} from './types.ts';

export const CLASSES = {
  registered_root_class: {
    title: 'Registered root class (Date + bigint + array)',
    serializeNotes:
      'A registered `Ledger` class round-trips its declared props through every strategy and reconstructs a real instance; Date rides its ISO arm and bigint its decimal-string arm. Value-first schema not-supported (a class is not an `RT.*` model).',
    mutateEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoder<Ledger>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoder<Ledger>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoder<Ledger>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonEncoder<Ledger>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoder<Ledger>();
    },
    preserveDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoder<Ledger>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createJsonDecoder<Ledger>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createBinaryEncoder<Ledger>();
    },
    binaryDecoder: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      registerClassSerializer(Ledger, {deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags)});
      return createBinaryDecoder<Ledger>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Ledger {
        constructor(
          public owner: string,
          public opened: Date,
          public balance: bigint,
          public tags: string[]
        ) {}
        summary(): string {
          return `${this.owner}:${this.balance}`;
        }
      }
      return {
        values: [
          new Ledger('alice', new Date('2023-06-01T00:00:00.000Z'), 10000000000000000000n, ['x', 'y']),
          new Ledger('bob', new Date('2019-02-03T04:05:06.000Z'), 0n, []),
        ],
      };
    },
  },
  nested_registered_class: {
    title: 'Object holding a registered class property',
    serializeNotes:
      'A registered `Vertex` class nested as `origin` reconstructs inside the containing object through every strategy. Value-first schema not-supported (contains a class).',
    mutateEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoder<{name: string; origin: Vertex}>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoder<{name: string; origin: Vertex}>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoder<{name: string; origin: Vertex}>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonEncoder<{name: string; origin: Vertex}>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoder<{name: string; origin: Vertex}>();
    },
    preserveDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoder<{name: string; origin: Vertex}>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createJsonDecoder<{name: string; origin: Vertex}>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createBinaryEncoder<{name: string; origin: Vertex}>();
    },
    binaryDecoder: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
      return createBinaryDecoder<{name: string; origin: Vertex}>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Vertex {
        constructor(
          public x: number,
          public y: number
        ) {}
        norm(): number {
          return Math.hypot(this.x, this.y);
        }
      }
      return {
        values: [
          {name: 'triangle', origin: new Vertex(3, 4)},
          {name: 'origin', origin: new Vertex(0, 0)},
        ],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;

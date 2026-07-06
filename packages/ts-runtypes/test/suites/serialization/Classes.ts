// Registered user classes run through the full serialization strategy matrix
// (mutate / clone / direct / compact × strip / preserve, plus binary). Decode
// reconstructs a real instance; the suite asserts the DATA round-trips through
// every strategy (the reconstruction / `instanceof` guarantees are pinned in
// test/features/classSerializer*.test.ts). Value-first schema is 'not-supported'
// (a class is not an `RT.*` model), so the id-integrity driver skips it.
import {
  registerClassSerializer,
  createBinaryDecoder,
  createBinaryEncoder,
  createJsonDecoder,
  createJsonEncoder,
} from 'ts-runtypes';
import type {SerializationCase} from './types.ts';

// A root class with mixed serializable fields (Date + bigint + array).
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
function regLedger(): void {
  registerClassSerializer(Ledger, {
    deserialize: (d) => new Ledger(d.owner, d.opened, d.balance, d.tags),
  });
}

// A class held as an object property (nested reconstruction).
class Vertex {
  constructor(
    public x: number,
    public y: number
  ) {}
  norm(): number {
    return Math.hypot(this.x, this.y);
  }
}
type Polygon = {name: string; origin: Vertex};
function regVertex(): void {
  registerClassSerializer(Vertex, {deserialize: (d) => new Vertex(d.x, d.y)});
}

export const CLASSES = {
  registered_root_class: {
    title: 'Registered root class (Date + bigint + array)',
    serializeNotes:
      'A registered `Ledger` class round-trips its declared props through every strategy and reconstructs a real instance; Date rides its ISO arm and bigint its decimal-string arm. Value-first schema not-supported (a class is not an `RT.*` model).',
    mutateEncoder: () => {
      regLedger();
      return createJsonEncoder<Ledger>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      regLedger();
      return createJsonEncoder<Ledger>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      regLedger();
      return createJsonEncoder<Ledger>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      regLedger();
      return createJsonEncoder<Ledger>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      regLedger();
      return createJsonDecoder<Ledger>();
    },
    preserveDecoder: () => {
      regLedger();
      return createJsonDecoder<Ledger>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      regLedger();
      return createJsonDecoder<Ledger>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      regLedger();
      return createBinaryEncoder<Ledger>();
    },
    binaryDecoder: () => {
      regLedger();
      return createBinaryDecoder<Ledger>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => ({
      values: [
        new Ledger('alice', new Date('2023-06-01T00:00:00.000Z'), 10000000000000000000n, ['x', 'y']),
        new Ledger('bob', new Date('2019-02-03T04:05:06.000Z'), 0n, []),
      ],
    }),
  },
  nested_registered_class: {
    title: 'Object holding a registered class property',
    serializeNotes:
      'A registered `Vertex` class nested as `origin` reconstructs inside the containing object through every strategy. Value-first schema not-supported (contains a class).',
    mutateEncoder: () => {
      regVertex();
      return createJsonEncoder<Polygon>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      regVertex();
      return createJsonEncoder<Polygon>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      regVertex();
      return createJsonEncoder<Polygon>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      regVertex();
      return createJsonEncoder<Polygon>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      regVertex();
      return createJsonDecoder<Polygon>();
    },
    preserveDecoder: () => {
      regVertex();
      return createJsonDecoder<Polygon>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      regVertex();
      return createJsonDecoder<Polygon>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      regVertex();
      return createBinaryEncoder<Polygon>();
    },
    binaryDecoder: () => {
      regVertex();
      return createBinaryDecoder<Polygon>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => ({
      values: [
        {name: 'triangle', origin: new Vertex(3, 4)},
        {name: 'origin', origin: new Vertex(0, 0)},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;

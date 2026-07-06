// A registered user class whose fields carry TYPE FORMATS — proving the
// class-serializer path composes with the format families: the currency field's
// integer bounds still select the narrow binary width INSIDE the class encode,
// the Date field still round-trips via ISO string, and decode reconstructs a
// real instance. The value-first schema variants are 'not-supported' (a class is
// not expressible as an `RT.*` model), so the id-integrity driver skips them.
//
// NOTE: the `Invoice` class is defined INSIDE each thunk (never module scope),
// even though it repeats — the website doc pipeline extracts each thunk as a
// standalone, self-contained code sample.
import * as TF from 'ts-runtypes/formats';
import type {SerializationCase} from './types.ts';
import 'ts-runtypes/formats';
import {
  registerClassSerializer,
  createBinaryDecoder,
  createBinaryEncoder,
  createJsonDecoder,
  createJsonEncoder,
} from 'ts-runtypes';

export const CLASS_WITH_FORMATS = {
  invoice_currency_and_date: {
    title: 'Class with a currency-format field + Date',
    description:
      'A registered `Invoice` class carrying a `TF.Currency<{integer,min:0,max:65535}>` field and a Date. Reconstruction composes with the format families: the uint16 currency bounds pick the 2-byte binary width inside the class encode, the Date rides its ISO-string arm, and decode rebuilds a real Invoice.',
    serializeNotes:
      'Class serializer keyed by type id; the currency format still packs to 2 bytes on the binary wire inside the class body. Value-first schema is not-supported (a class is not an `RT.*` model).',
    mutateEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoder<Invoice>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoder<Invoice>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoder<Invoice>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonEncoder<Invoice>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoder<Invoice>();
    },
    preserveDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoder<Invoice>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createJsonDecoder<Invoice>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createBinaryEncoder<Invoice>();
    },
    binaryDecoder: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      registerClassSerializer(Invoice, {deserialize: (d) => new Invoice(d.ref, d.cents, d.issued)});
      return createBinaryDecoder<Invoice>();
    },
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      class Invoice {
        constructor(
          public ref: string,
          public cents: TF.Currency<{integer: true; min: 0; max: 65535}>,
          public issued: Date
        ) {}
        total(): number {
          return this.cents / 100;
        }
      }
      return {
        values: [
          new Invoice('A-1', 1999, new Date('2024-01-02T03:04:05.000Z')),
          new Invoice('B-2', 0, new Date('2020-12-31T00:00:00.000Z')),
        ],
      };
    },
  },
} as const satisfies Record<string, SerializationCase>;

import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const OBJECTS = {
  interface: {
    title: 'interface',
    mutateEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'direct'}),
    stripDecoder: () =>
      createJsonDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    preserveDecoder: () =>
      createJsonDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () =>
      createBinaryEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    binaryDecoder: () =>
      createBinaryDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        big: bigint;
        stringArray: string[];
        "weird prop name \n?>'\\\t\r": string;
        optionalString?: string;
      }>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          big: RT.bigint(),
          stringArray: RT.array(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          optionalString: RT.optional(RT.string()),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          big: RT.bigint(),
          stringArray: RT.array(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          optionalString: RT.optional(RT.string()),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          big: RT.bigint(),
          stringArray: RT.array(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          optionalString: RT.optional(RT.string()),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          big: RT.bigint(),
          stringArray: RT.array(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          optionalString: RT.optional(RT.string()),
        })
      ),
    getTestData: () => {
      const value = {
        startDate: new Date('2000-08-06T02:13:00.000Z'),
        quantity: 123,
        name: 'hello',
        nullValue: null,
        big: BigInt(123),
        stringArray: ['a', 'b', 'c'],
        "weird prop name \n?>'\\\t\r": 'hello2',
      };
      const valueWithOptional = {...value, optionalString: 'hello3'};
      return {values: [value, valueWithOptional]};
    },
  },
  many_optional_props: {
    title: 'many optional properties',
    mutateEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoder<ManyOptional>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoder<ManyOptional>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonEncoder<ManyOptional>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonDecoder<ManyOptional>();
    },
    preserveDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createJsonDecoder<ManyOptional>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createBinaryEncoder<ManyOptional>();
    },
    binaryDecoder: () => {
      type N = number;
      // prettier-ignore
      type ManyOptional = {
          a0?: N; a1?: N; a2?: N; a3?: N; a4?: N; a5?: N; a6?: N; a7?: N;
          a8?: N; a9?: N; a10?: N; a11?: N; a12?: N; a13?: N; a14?: N; a15?: N;
          b0?: N; b1?: N; b2?: N; b3?: N; b4?: N; b5?: N; b6?: N; b7?: N;
          b8?: N; b9?: N; b10?: N; b11?: N; b12?: N; b13?: N; b14?: N; b15?: N;
        };
      return createBinaryDecoder<ManyOptional>();
    },
    schemaEncoder: () => {
      const n = () => RT.optional(RT.number());
      return createJsonEncoder(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaDecoder: () => {
      const n = () => RT.optional(RT.number());
      return createJsonDecoder(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaBinaryEncoder: () => {
      const n = () => RT.optional(RT.number());
      return createBinaryEncoder(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    schemaBinaryDecoder: () => {
      const n = () => RT.optional(RT.number());
      return createBinaryDecoder(
        RT.object({
          a0: n(),
          a1: n(),
          a2: n(),
          a3: n(),
          a4: n(),
          a5: n(),
          a6: n(),
          a7: n(),
          a8: n(),
          a9: n(),
          a10: n(),
          a11: n(),
          a12: n(),
          a13: n(),
          a14: n(),
          a15: n(),
          b0: n(),
          b1: n(),
          b2: n(),
          b3: n(),
          b4: n(),
          b5: n(),
          b6: n(),
          b7: n(),
          b8: n(),
          b9: n(),
          b10: n(),
          b11: n(),
          b12: n(),
          b13: n(),
          b14: n(),
          b15: n(),
        })
      );
    },
    getTestData: () => ({
      values: [{a0: 0, a1: 1, b0: 16, a8: 8, b7: 23, b15: 31}, {a0: 0, b8: 24}, {}],
    }),
  },
  class: {
    title: 'class',
    mutateEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<MySerializableClass>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder<MySerializableClass>();
    },
    preserveDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder<MySerializableClass>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoder<MySerializableClass>();
    },
    binaryDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoder<MySerializableClass>();
    },
    schemaEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder(RT.classType(MySerializableClass));
    },
    schemaDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder(RT.classType(MySerializableClass));
    },
    schemaBinaryEncoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoder(RT.classType(MySerializableClass));
    },
    schemaBinaryDecoder: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoder(RT.classType(MySerializableClass));
    },
    getTestData: () => {
      class MySerializableClass {
        name: string;
        surname: string;
        id: number;
        startDate: Date;
        constructor() {
          this.name = 'John';
          this.surname = 'Doe';
          this.id = 0;
          this.startDate = new Date('2000-08-06T02:13:00.000Z');
        }
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      const item = new MySerializableClass();
      const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
      return {values: [new MySerializableClass()], deserializedValues: [restored]};
    },
  },
  extended_class: {
    title: 'extended class',
    mutateEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoder<ExtendedClass>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoder<ExtendedClass>();
    },
    preserveDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoder<ExtendedClass>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryEncoder<ExtendedClass>();
    },
    binaryDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryDecoder<ExtendedClass>();
    },
    schemaEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonEncoder(RT.classType(ExtendedClass));
    },
    schemaDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createJsonDecoder(RT.classType(ExtendedClass));
    },
    schemaBinaryEncoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryEncoder(RT.classType(ExtendedClass));
    },
    schemaBinaryDecoder: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return createBinaryDecoder(RT.classType(ExtendedClass));
    },
    getTestData: () => {
      class BaseClass {
        baseProp: string = 'base';
      }
      class ExtendedClass extends BaseClass {
        extendedProp: string = 'extended';
      }
      return {values: [new ExtendedClass()]};
    },
  },
  non_serializable_class: {
    title: 'non-serializable class via deserialize function',
    description:
      'mion registers a deserialize fn so the class instance can be reconstructed; without that registration, JSON yields a plain object.',
    mutateEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder<NonSerializableClass>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder<NonSerializableClass>();
    },
    preserveDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder<NonSerializableClass>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoder<NonSerializableClass>();
    },
    binaryDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoder<NonSerializableClass>();
    },
    schemaEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonEncoder(RT.classType(NonSerializableClass));
    },
    schemaDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createJsonDecoder(RT.classType(NonSerializableClass));
    },
    schemaBinaryEncoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryEncoder(RT.classType(NonSerializableClass));
    },
    schemaBinaryDecoder: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      return createBinaryDecoder(RT.classType(NonSerializableClass));
    },
    getTestData: () => {
      class NonSerializableClass {
        constructor(
          public name: string,
          public surname: string,
          public id: number,
          public startDate: Date
        ) {}
        getFullName() {
          return `${this.name} ${this.surname}`;
        }
      }
      const item = new NonSerializableClass('John', 'Doe', 0, new Date('2000-08-06T02:13:00.000Z'));
      const restored = {name: item.name, surname: item.surname, id: item.id, startDate: item.startDate};
      return {values: [item], deserializedValues: [restored]};
    },
  },
  undefined_in_object: {
    title: 'undefined is omitted in object prop',
    mutateEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; b: number; c: undefined}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number; c: undefined}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number; c: undefined}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({a: RT.string(), b: RT.number(), c: RT.literal(undefined)})),
    schemaDecoder: () => createJsonDecoder(RT.object({a: RT.string(), b: RT.number(), c: RT.literal(undefined)})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({a: RT.string(), b: RT.number(), c: RT.literal(undefined)})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({a: RT.string(), b: RT.number(), c: RT.literal(undefined)})),
    getTestData: () => ({
      values: [{a: 'hello', b: 42, c: undefined}],
      deserializedValues: [{a: 'hello', b: 42}],
    }),
  },
  optional_properties_order: {
    title: 'optional properties order',
    mutateEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string; b?: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b?: string}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; b?: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b?: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b?: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({a: RT.string(), b: RT.optional(RT.string())})),
    schemaDecoder: () => createJsonDecoder(RT.object({a: RT.string(), b: RT.optional(RT.string())})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({a: RT.string(), b: RT.optional(RT.string())})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({a: RT.string(), b: RT.optional(RT.string())})),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}]}),
  },
  all_optional_fields: {
    title: 'all optional fields',
    mutateEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a?: string; b?: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a?: string; b?: string}>(),
    preserveDecoder: () => createJsonDecoder<{a?: string; b?: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a?: string; b?: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a?: string; b?: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.string())})),
    schemaDecoder: () => createJsonDecoder(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.string())})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.string())})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({a: RT.optional(RT.string()), b: RT.optional(RT.string())})),
    getTestData: () => ({values: [{a: 'helloA', b: 'helloB'}, {a: 'helloA'}, {}]}),
  },
  extras_passthrough_unsafe: {
    title: 'unsafe path preserves extras (mion semantic — JSON.stringify does not strip)',
    description:
      "Canonical baseline for the `prepareForJson + JSON.stringify` path: declared children get transformed, structural extras (both top-level and nested-in-declared-composites) pass through unchanged. Mirrors mion's `03JsonObjects.spec.ts` strip-extras case where the strip expectation is explicitly commented out (`// native JSON.stringify do not strip extra params`). The safe path (`stripUnknownKeys + prepareForJson + JSON.stringify`) strips the extras — that divergence is exercised in EXTRA_PARAMS.",
    mutateEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'direct'}),
    stripDecoder: () =>
      createJsonDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    preserveDecoder: () =>
      createJsonDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () =>
      createBinaryEncoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    binaryDecoder: () =>
      createBinaryDecoder<{
        startDate: Date;
        quantity: number;
        name: string;
        nullValue: null;
        stringArray: string[];
        bigInt: bigint;
        optionalString?: string;
        "weird prop name \n?>'\\\t\r": string;
        deep: {a: string; b: number};
        '?other weird p': {c: string; d: number};
      }>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(RT.string()),
          bigInt: RT.bigint(),
          optionalString: RT.optional(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          deep: RT.object({a: RT.string(), b: RT.number()}),
          '?other weird p': RT.object({c: RT.string(), d: RT.number()}),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(RT.string()),
          bigInt: RT.bigint(),
          optionalString: RT.optional(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          deep: RT.object({a: RT.string(), b: RT.number()}),
          '?other weird p': RT.object({c: RT.string(), d: RT.number()}),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(RT.string()),
          bigInt: RT.bigint(),
          optionalString: RT.optional(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          deep: RT.object({a: RT.string(), b: RT.number()}),
          '?other weird p': RT.object({c: RT.string(), d: RT.number()}),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          startDate: RT.date(),
          quantity: RT.number(),
          name: RT.string(),
          nullValue: RT.literal(null),
          stringArray: RT.array(RT.string()),
          bigInt: RT.bigint(),
          optionalString: RT.optional(RT.string()),
          "weird prop name \n?>'\\\t\r": RT.string(),
          deep: RT.object({a: RT.string(), b: RT.number()}),
          '?other weird p': RT.object({c: RT.string(), d: RT.number()}),
        })
      ),
    getTestData: () => {
      const startDate = new Date('2000-08-06T02:13:00.000Z');
      const objectWithExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123, cExtra: true},
        '?other weird p': {c: 'hello', d: 123, eExtra: true},
        extraA: 'hello',
        extraB: 123,
        extraC: true,
      };
      // Unsafe path: extras preserved through round-trip — expected
      // result equals the input (no `deserializedValues` override).
      return {values: [objectWithExtraParams]};
    },
    getTestDataForStringify: () => {
      const startDate = new Date('2000-08-06T02:13:00.000Z');
      const objectWithExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123, cExtra: true},
        '?other weird p': {c: 'hello', d: 123, eExtra: true},
        extraA: 'hello',
        extraB: 123,
        extraC: true,
      };
      const noExtraParams = {
        startDate,
        quantity: 123,
        name: 'hello',
        nullValue: null,
        stringArray: ['a', 'b', 'c'],
        bigInt: BigInt(123),
        "weird prop name \n?>'\\\t\r": 'hello2',
        deep: {a: 'hello', b: 123},
        '?other weird p': {c: 'hello', d: 123},
      };
      // Safe path: extras are stripped before serialise, so the
      // round-trip restores the declared-only shape.
      return {values: [objectWithExtraParams], deserializedValues: [noExtraParams]};
    },
  },
  interface_circular: {
    title: 'interface circular',
    mutateEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoder<ICircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoder<ICircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonEncoder<ICircular>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonDecoder<ICircular>();
    },
    preserveDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createJsonDecoder<ICircular>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createBinaryEncoder<ICircular>();
    },
    binaryDecoder: () => {
      interface ICircular {
        name: string;
        child?: ICircular;
      }
      return createBinaryDecoder<ICircular>();
    },
    schemaEncoder: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createJsonEncoder(ic);
    },
    schemaDecoder: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createJsonDecoder(ic);
    },
    schemaBinaryEncoder: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createBinaryEncoder(ic);
    },
    schemaBinaryDecoder: () => {
      const ic = RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}));
      return createBinaryDecoder(ic);
    },
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  interface_circular_array: {
    title: 'interface circular array',
    mutateEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoder<ICircularArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoder<ICircularArray>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonEncoder<ICircularArray>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonDecoder<ICircularArray>();
    },
    preserveDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createJsonDecoder<ICircularArray>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createBinaryEncoder<ICircularArray>();
    },
    binaryDecoder: () => {
      interface ICircularArray {
        name: string;
        children?: ICircularArray[];
      }
      return createBinaryDecoder<ICircularArray>();
    },
    schemaEncoder: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createJsonEncoder(ica);
    },
    schemaDecoder: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createJsonDecoder(ica);
    },
    schemaBinaryEncoder: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createBinaryEncoder(ica);
    },
    schemaBinaryDecoder: () => {
      const ica = RT.circular((self) => RT.object({name: RT.string(), children: RT.optional(RT.array(self))}));
      return createBinaryDecoder(ica);
    },
    getTestData: () => ({
      values: [
        {name: 'hello', children: []},
        {name: 'hello', children: [{name: 'world'}]},
      ],
    }),
  },
  interface_circular_deep: {
    title: 'interface circular deep',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonEncoder<ICircularDeep>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonDecoder<ICircularDeep>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createJsonDecoder<ICircularDeep>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createBinaryEncoder<ICircularDeep>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {
          hello: string;
          child?: ICircularDeep;
        };
      }
      return createBinaryDecoder<ICircularDeep>();
    },
    schemaEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      return createJsonEncoder(icd);
    },
    schemaDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      return createJsonDecoder(icd);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      return createBinaryEncoder(icd);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      return createBinaryDecoder(icd);
    },
    getTestData: () => ({
      values: [
        {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        {
          name: 'hello',
          big: 2n,
          embedded: {hello: 'world', child: {name: 'world1', big: 3n, embedded: {hello: 'world2'}}},
        },
      ],
    }),
  },
  interface_root_not_circular: {
    title: 'interface root not circular',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonEncoder<RootNotCircular>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonDecoder<RootNotCircular>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createJsonDecoder<RootNotCircular>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createBinaryEncoder<RootNotCircular>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createBinaryDecoder<RootNotCircular>();
    },
    schemaEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createJsonEncoder(root);
    },
    schemaDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createJsonDecoder(root);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createBinaryEncoder(root);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createBinaryDecoder(root);
    },
    getTestData: () => ({
      values: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 2n,
            embedded: {hello: 'world', child: {name: 'world1', big: 2n, embedded: {hello: 'world2'}}},
          },
        },
      ],
    }),
  },
  interface_multiple_circular: {
    title: 'interface multiple circular',
    mutateEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoder<RootCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoder<RootCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonEncoder<RootCircular>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonDecoder<RootCircular>();
    },
    preserveDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createJsonDecoder<RootCircular>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createBinaryEncoder<RootCircular>();
    },
    binaryDecoder: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      interface RootCircular {
        isRoot: true;
        ciChild: ICircularDeep;
        ciRoort?: RootCircular;
        ciDate: ICircularDate;
      }
      return createBinaryDecoder<RootCircular>();
    },
    schemaEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const icDate = RT.circular((self) =>
        RT.object({date: RT.date(), month: RT.number(), year: RT.number(), embedded: RT.optional(self), deep: RT.optional(icd)})
      );
      const root = RT.circular((self) =>
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(self), ciDate: icDate})
      );
      return createJsonEncoder(root);
    },
    schemaDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const icDate = RT.circular((self) =>
        RT.object({date: RT.date(), month: RT.number(), year: RT.number(), embedded: RT.optional(self), deep: RT.optional(icd)})
      );
      const root = RT.circular((self) =>
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(self), ciDate: icDate})
      );
      return createJsonDecoder(root);
    },
    schemaBinaryEncoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const icDate = RT.circular((self) =>
        RT.object({date: RT.date(), month: RT.number(), year: RT.number(), embedded: RT.optional(self), deep: RT.optional(icd)})
      );
      const root = RT.circular((self) =>
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(self), ciDate: icDate})
      );
      return createBinaryEncoder(root);
    },
    schemaBinaryDecoder: () => {
      const icd = RT.circular((self) =>
        RT.object({name: RT.string(), big: RT.bigint(), embedded: RT.object({hello: RT.string(), child: RT.optional(self)})})
      );
      const icDate = RT.circular((self) =>
        RT.object({date: RT.date(), month: RT.number(), year: RT.number(), embedded: RT.optional(self), deep: RT.optional(icd)})
      );
      const root = RT.circular((self) =>
        RT.object({isRoot: RT.literal(true), ciChild: icd, ciRoort: RT.optional(self), ciDate: icDate})
      );
      return createBinaryDecoder(root);
    },
    getTestData: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface ICircularDate {
        date: Date;
        month: number;
        year: number;
        embedded?: ICircularDate;
        deep?: ICircularDeep;
      }
      const ciDate: ICircularDate = {date: new Date('2000-08-06T02:13:00.000Z'), month: 1, year: 2021};
      return {
        values: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}, ciDate},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
            ciDate,
          },
        ],
      };
    },
  },
  interface_with_methods: {
    title: 'methods should be excluded from interface when serializing',
    mutateEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonEncoder<ObjectWithMethods>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonDecoder<ObjectWithMethods>();
    },
    preserveDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createJsonDecoder<ObjectWithMethods>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createBinaryEncoder<ObjectWithMethods>();
    },
    binaryDecoder: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      return createBinaryDecoder<ObjectWithMethods>();
    },
    schemaEncoder: () => createJsonEncoder(RT.object({name: RT.string(), methodProp: RT.func([], RT.any())})),
    schemaDecoder: () => createJsonDecoder(RT.object({name: RT.string(), methodProp: RT.func([], RT.any())})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({name: RT.string(), methodProp: RT.func([], RT.any())})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({name: RT.string(), methodProp: RT.func([], RT.any())})),
    getTestData: () => {
      interface ObjectWithMethods {
        name: string;
        methodProp: () => any;
      }
      const objWithMethod = {
        name: 'John',
        methodProp() {
          return 'method result';
        },
      } as ObjectWithMethods;
      return {values: [objWithMethod], deserializedValues: [{name: 'John'}]};
    },
  },
} as const satisfies Record<string, SerializationCase>;

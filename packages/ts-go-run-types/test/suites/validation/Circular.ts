import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const CIRCULAR = {
  object_full_mion_shape: {
    title: 'Self-referential object with optional self-ref and Date prop',
    description:
      "mion circularRefs.spec.ts 'Circular object' — full mion fixture (number + string + self-ref + Date). Exercises the same self-recursive dependency call as OBJECT.circular_interface but pins the exact mion shape.",
    isTypeNotes:
      'Self-referential shapes are validated recursively. Atomic rules apply at every level (NaN at `n`, Invalid Date at `d`, etc.).',
    isType: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createIsType<Circular>();
    },
    isTypeSchema: () => {
      const cir = RT.circular((self) =>
        RT.object({
          n: RT.number(),
          s: RT.string(),
          c: RT.optional(self),
          d: RT.optional(RT.date()),
        })
      );
      return createIsType(cir);
    },
    deserializeIsType: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return deserializeIsType<Circular>();
    },
    isTypeReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createGetTypeErrors<Circular>();
    },
    getTypeErrorsSchema: () => {
      const cir = RT.circular((self) =>
        RT.object({
          n: RT.number(),
          s: RT.string(),
          c: RT.optional(self),
          d: RT.optional(RT.date()),
        })
      );
      return createGetTypeErrors(cir);
    },
    deserializeGetTypeErrors: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return deserializeGetTypeErrors<Circular>();
    },
    getTypeErrorsReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      return createMockType<Circular>();
    },
    mockTypeReflect: () => {
      interface Circular {
        n: number;
        s: string;
        c?: Circular;
        d?: Date;
      }
      const v: Circular = {n: 1, s: 'hello'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {n: 1, s: 'hello', c: {n: 2, s: 'world'}},
        {n: 2, s: 'world'},
        {n: 3, s: 'foo', c: {n: 3, s: 'foo'}},
      ],
      invalid: [
        {n: 1, s: 'hello', c: {n: 2, s: 123}}, // c.s wrong type
        {n: 1, s: 'hello', c: {n: 2}}, // c.s missing
        null,
        undefined,
        {n: NaN, s: 'x'}, // NaN at n
        {n: 1, s: 'x', d: new Date('invalid')}, // Invalid Date in optional d
        {n: 1, s: 'x', d: 'not date'},
        {}, // missing required n and s
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['c', 's'], expected: 'string'}],
      [{path: ['c', 's'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['n'], expected: 'number'}],
      [{path: ['d'], expected: 'date'}],
      [{path: ['d'], expected: 'date'}],
      [
        {path: ['n'], expected: 'number'},
        {path: ['s'], expected: 'string'},
      ],
    ],
  },

  array_of_union_with_self_ref: {
    title: 'Self-referential array whose union element includes the array itself',
    description:
      "mion circularRefs.spec.ts 'Circular array + union' — self-recursive array whose element type is a union including the array itself. Closes the cycle via Array → Union → Array.",
    isTypeSchema: () => {
      const cu = RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])));
      return createIsType(cu);
    },
    isType: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createIsType<CuArray>();
    },
    deserializeIsType: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return deserializeIsType<CuArray>();
    },
    isTypeReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createGetTypeErrors<CuArray>();
    },
    getTypeErrorsSchema: () => {
      const cu = RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])));
      return createGetTypeErrors(cu);
    },
    deserializeGetTypeErrors: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return deserializeGetTypeErrors<CuArray>();
    },
    getTypeErrorsReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createMockType<CuArray>();
    },
    mockTypeReflect: () => {
      type CuArray = (CuArray | Date | number | string)[];
      const v: CuArray = [];
      return createMockType(v);
    },
    getSamples: () => {
      const date = new Date();
      const cu1: any = [date, 123, 'hello', ['a', 'b', 'c']];
      const cu2: any = [date, 123, 'hello', ['a', 2, 'c'], cu1];
      const cu3: any = [];
      return {
        valid: [cu1, cu2, cu3],
        invalid: [
          [date, 123, 'hello', ['a', 2, 'c'], {a: 1, b: 2}], // {} not in union
          ['hello', 123, [{a: 1, b: 2}]],
          {},
          null,
          undefined,
          [true], // boolean not in union
          [new Date('invalid')], // Invalid Date inside
          [NaN], // NaN as number
        ],
      };
    },
    getExpectedErrors: () => [
      // index 4 is {a:1, b:2} which isn't in the union.
      [{path: [4], expected: 'union'}],
      // index 2 is [{a,b}] — the inner array fails the union check
      // (its element doesn't match any arm), so the OUTER union
      // reports one error at index 2 (union emit doesn't recurse —
      // it's a boolean delegation to isType per mion semantic).
      [{path: [2], expected: 'union'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
      [{path: [0], expected: 'union'}],
    ],
  },

  object_with_tuple_prop: {
    title: 'Self-referential object whose cycle closes via a tuple property',
    description:
      "mion circularRefs.spec.ts 'Circular object with tuple' — cycle closed via a tuple-typed property. Same mechanism as TUPLE.tuple_circular but the recursion goes through an object → tuple boundary.",
    isType: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createIsType<CircularTuple>();
    },
    isTypeSchema: () => {
      const ct = RT.circular((self) => RT.object({tuple: RT.tuple([RT.bigint()], [self])}));
      return createIsType(ct);
    },
    deserializeIsType: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return deserializeIsType<CircularTuple>();
    },
    isTypeReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createGetTypeErrors<CircularTuple>();
    },
    getTypeErrorsSchema: () => {
      const ct = RT.circular((self) => RT.object({tuple: RT.tuple([RT.bigint()], [self])}));
      return createGetTypeErrors(ct);
    },
    deserializeGetTypeErrors: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return deserializeGetTypeErrors<CircularTuple>();
    },
    getTypeErrorsReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      return createMockType<CircularTuple>();
    },
    mockTypeReflect: () => {
      interface CircularTuple {
        tuple: [bigint, CircularTuple?];
      }
      const v: CircularTuple = {tuple: [1n]};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]}, {tuple: [1n, {tuple: [2n]}]}, {tuple: [1n]}],
      invalid: [
        {tuple: [1n, {tuple: 'hello'}]}, // inner `tuple` not an array
        {tuple: [1n, {tuple: []}]}, // empty inner tuple — missing required bigint
        [],
        null,
        undefined,
        {tuple: ['not bigint']},
        {tuple: [1n, 'not object']}, // second slot wrong type
        {}, // missing required tuple prop
      ],
    }),
    getExpectedErrors: () => [
      // {tuple: [1n, {tuple: 'hello'}]} — inner.tuple is not an array.
      [{path: ['tuple', 1, 'tuple'], expected: 'tuple'}],
      // {tuple: [1n, {tuple: []}]} — inner tuple [] has slot 0 missing.
      [{path: ['tuple', 1, 'tuple', 0], expected: 'bigint'}],
      // [] — typeof === 'object' && !== null passes (arrays are objects);
      // descends to check `tuple` prop. v.tuple is undefined → tuple
      // check fails at ['tuple'].
      [{path: ['tuple'], expected: 'tuple'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {tuple: ['not bigint']} — slot 0 wrong type.
      [{path: ['tuple', 0], expected: 'bigint'}],
      // {tuple: [1n, 'not object']} — slot 1 is non-undefined but not an object.
      [{path: ['tuple', 1], expected: 'objectLiteral'}],
      // {} — missing required tuple prop → tuple defaults to undefined.
      [{path: ['tuple'], expected: 'tuple'}],
    ],
  },

  object_with_index_prop: {
    title: 'Self-referential object whose cycle closes via an index signature',
    description:
      "mion circularRefs.spec.ts 'Circular Object with index property' — cycle closed via an index-signature value type. Exercises the index-signature for-in loop calling back into the same validator.",
    isType: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createIsType<CircularIndex>();
    },
    isTypeSchema: () => {
      const ci = RT.circular((self) => RT.object({index: RT.record(self)}));
      return createIsType(ci);
    },
    deserializeIsType: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return deserializeIsType<CircularIndex>();
    },
    isTypeReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createGetTypeErrors<CircularIndex>();
    },
    getTypeErrorsSchema: () => {
      const ci = RT.circular((self) => RT.object({index: RT.record(self)}));
      return createGetTypeErrors(ci);
    },
    deserializeGetTypeErrors: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return deserializeGetTypeErrors<CircularIndex>();
    },
    getTypeErrorsReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createMockType<CircularIndex>();
    },
    mockTypeReflect: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      const v: CircularIndex = {index: {}};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
      invalid: [
        {index: {a: 1234}}, // value not an object
        {index: {a: {index: 'hello'}}}, // nested `index` wrong type
        new Date(), // missing `index` property
        null,
        undefined,
        {}, // missing required index prop
        {index: 'not object'},
        {index: {a: null}},
      ],
    }),
    getExpectedErrors: () => [
      // {index: {a: 1234}} — index['a'] is not a CircularIndex object.
      [{path: ['index', 'a'], expected: 'objectLiteral'}],
      // {index: {a: {index: 'hello'}}} — nested .index is not an object.
      [{path: ['index', 'a', 'index'], expected: 'objectLiteral'}],
      // new Date() — Date doesn't have an `index` prop matching the shape.
      // It IS a plain `typeof === 'object' && !== null` — but
      // missing `index` prop → typeErrors at ['index'].
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: ['index'], expected: 'objectLiteral'}],
      [{path: ['index', 'a'], expected: 'objectLiteral'}],
    ],
  },

  object_deeply_nested: {
    title: 'Self-referential object with the cycle buried four levels deep',
    description:
      "mion circularRefs.spec.ts 'Circular Object with deep nested properties' — cycle closed via four levels of nested object properties. Stresses the dependency-call layer when the self-ref is buried deep in an anonymous-shape chain.",
    isType: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createIsType<CircularDeep>();
    },
    isTypeSchema: () => {
      const cd = RT.circular((self) =>
        RT.object({
          deep1: RT.object({
            deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})}),
          }),
        })
      );
      return createIsType(cd);
    },
    deserializeIsType: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return deserializeIsType<CircularDeep>();
    },
    isTypeReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createGetTypeErrors<CircularDeep>();
    },
    getTypeErrorsSchema: () => {
      const cd = RT.circular((self) =>
        RT.object({
          deep1: RT.object({
            deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})}),
          }),
        })
      );
      return createGetTypeErrors(cd);
    },
    deserializeGetTypeErrors: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return deserializeGetTypeErrors<CircularDeep>();
    },
    getTypeErrorsReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createMockType<CircularDeep>();
    },
    mockTypeReflect: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
      invalid: [
        {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: 1234}}}}}}},
        {deep1: {}},
        {deep1: {deep2: {deep3: 12435}}},
        {deep1: {deep2: {deep3: {deep4: 'hello'}}}},
        'hello',
        null,
        undefined,
        {}, // missing deep1
        {deep1: null},
        {deep1: {deep2: null}},
      ],
    }),
    getExpectedErrors: () => [
      // deep4.deep1.deep2.deep3 = 1234 → not an object.
      [{path: ['deep1', 'deep2', 'deep3', 'deep4', 'deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
      // {deep1: {}} — deep1 missing deep2.
      [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
      // deep1.deep2.deep3 = 12435.
      [{path: ['deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
      // deep1.deep2.deep3.deep4 = 'hello' — optional but non-undefined → recurse → not object.
      [{path: ['deep1', 'deep2', 'deep3', 'deep4'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — missing deep1.
      [{path: ['deep1'], expected: 'objectLiteral'}],
      // {deep1: null} — deep1 is null, fails object check.
      [{path: ['deep1'], expected: 'objectLiteral'}],
      // {deep1: {deep2: null}} — deep2 is null.
      [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
    ],
  },

  circular_child_under_literal_root: {
    title: 'Non-circular root holding a circular child interface',
    description:
      "mion interface.spec.ts 'Interface with nested circular type where root is not the circular ref' — RootNotCircular is a flat shape (literal discriminator + one prop) whose ciChild property is a self-referential ICircularDeep. Pins the case where the dependency-call layer kicks in BELOW the root rather than at the root itself.",
    isType: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createIsType<RootNotCircular>();
    },
    isTypeSchema: () => {
      // The recursive child is a `circular(...)`; the non-circular root is a plain
      // schema referencing it — no hand-written types at all.
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          big: RT.bigint(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createIsType(root);
    },
    deserializeIsType: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return deserializeIsType<RootNotCircular>();
    },
    isTypeReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createGetTypeErrors<RootNotCircular>();
    },
    getTypeErrorsSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          big: RT.bigint(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      const root = RT.object({isRoot: RT.literal(true), ciChild: icd});
      return createGetTypeErrors(root);
    },
    deserializeGetTypeErrors: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return deserializeGetTypeErrors<RootNotCircular>();
    },
    getTypeErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      return createMockType<RootNotCircular>();
    },
    mockTypeReflect: () => {
      interface ICircularDeep {
        name: string;
        big: bigint;
        embedded: {hello: string; child?: ICircularDeep};
      }
      interface RootNotCircular {
        isRoot: true;
        ciChild: ICircularDeep;
      }
      const v: RootNotCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
      };
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}},
        },
        {isRoot: true, ciChild: {name: 'hello', big: 1n}}, // missing embedded
        {isRoot: true}, // missing ciChild
        null,
        undefined,
        {},
      ],
    }),
    getExpectedErrors: () => [
      // ciChild.embedded.hello wrong type (123 not string).
      [{path: ['ciChild', 'embedded', 'hello'], expected: 'string'}],
      // ciChild.embedded.child.embedded.hello wrong type.
      [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
      // isRoot=false fails literal; child=123 is not an object (recurses
      // through optional, fails object check at the next ICircularDeep).
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild', 'embedded', 'child'], expected: 'objectLiteral'},
      ],
      // ciChild missing `embedded` → fails object check at ['ciChild', 'embedded'].
      [{path: ['ciChild', 'embedded'], expected: 'objectLiteral'}],
      // {isRoot: true} — missing ciChild.
      [{path: ['ciChild'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — both required props missing.
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild'], expected: 'objectLiteral'},
      ],
    ],
  },

  multiple_circular_types_cross_referenced: {
    title: 'Multiple circular types cross-referenced from a non-circular root',
    description:
      "mion interface.spec.ts 'Interface with nested circular + multiple circular' — RootCircular carries an optional self-ref AND two distinct circular siblings (ICircularDeep, ICircularDate), and ICircularDate also references ICircularDeep. Stresses the resolver / dependency-call layer when more than one recursive type is in flight at once and the cycles cross.",
    isType: () => {
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
      return createIsType<RootCircular>();
    },
    isTypeSchema: () => {
      // Mutual recursion, no types: each type's OWN back-edge uses `self`;
      // cross-references to an already-declared run-type are plain const refs.
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          big: RT.bigint(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      const icDate = RT.circular((self) =>
        RT.object({
          date: RT.date(),
          month: RT.number(),
          year: RT.number(),
          embedded: RT.optional(self),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular((self) =>
        RT.object({
          isRoot: RT.literal(true),
          ciChild: icd,
          ciRoort: RT.optional(self),
          ciDate: icDate,
        })
      );
      return createIsType(root);
    },
    deserializeIsType: () => {
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
      return deserializeIsType<RootCircular>();
    },
    isTypeReflect: () => {
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
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
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
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
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
      return createGetTypeErrors<RootCircular>();
    },
    getTypeErrorsSchema: () => {
      const icd = RT.circular((self) =>
        RT.object({
          name: RT.string(),
          big: RT.bigint(),
          embedded: RT.object({hello: RT.string(), child: RT.optional(self)}),
        })
      );
      const icDate = RT.circular((self) =>
        RT.object({
          date: RT.date(),
          month: RT.number(),
          year: RT.number(),
          embedded: RT.optional(self),
          deep: RT.optional(icd),
        })
      );
      const root = RT.circular((self) =>
        RT.object({
          isRoot: RT.literal(true),
          ciChild: icd,
          ciRoort: RT.optional(self),
          ciDate: icDate,
        })
      );
      return createGetTypeErrors(root);
    },
    deserializeGetTypeErrors: () => {
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
      return deserializeGetTypeErrors<RootCircular>();
    },
    getTypeErrorsReflect: () => {
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
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
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
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
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
      return createMockType<RootCircular>();
    },
    mockTypeReflect: () => {
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
      const v: RootCircular = {
        isRoot: true,
        ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        ciDate: {date: new Date(), month: 1, year: 2021},
      };
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {
            date: new Date(),
            month: 1,
            year: 2021,
            embedded: {date: new Date(), month: 1, year: 2021},
          },
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciRoort: {
            isRoot: true,
            ciChild: {name: 'inner', big: 2n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 6, year: 2022},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
      ],
      invalid: [
        {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // missing ciDate, embedded.hello wrong type
        {
          isRoot: true,
          ciChild: {
            name: 'hello',
            big: 1n,
            embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
          },
          ciDate: {date: new Date(), month: 1, year: 2021},
        }, // deep embedded.hello wrong type
        {
          isRoot: false, // not the literal true
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: 'not date', month: 1, year: 2021}, // ciDate.date wrong type
        },
        {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021, embedded: true}, // ciDate.embedded wrong type
        },
        null,
        undefined,
        {},
      ],
    }),
    getExpectedErrors: () => [
      // missing ciDate + ciChild.embedded.hello wrong type → 2 errors.
      [
        {path: ['ciChild', 'embedded', 'hello'], expected: 'string'},
        {path: ['ciDate'], expected: 'objectLiteral'},
      ],
      // deep embedded.hello wrong type.
      [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
      // isRoot=false fails literal.
      [{path: ['isRoot'], expected: 'literal'}],
      // ciDate.date wrong type.
      [{path: ['ciDate', 'date'], expected: 'date'}],
      // ciDate.embedded is true (boolean), optional but non-undefined →
      // recurses into ICircularDate check, which fails the object guard.
      [{path: ['ciDate', 'embedded'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      // {} — all 3 required props missing.
      [
        {path: ['isRoot'], expected: 'literal'},
        {path: ['ciChild'], expected: 'objectLiteral'},
        {path: ['ciDate'], expected: 'objectLiteral'},
      ],
    ],
  },
} as const satisfies Record<string, ValidationCase>;

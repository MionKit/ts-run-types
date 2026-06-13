// Real-world DTOs whose fields carry type-formats — the everyday case for the
// format machinery: a uuid id and an email, on a user and an order. Each thunk is
// SELF-DECLARING: the `interface` (with its branded format fields) is written inside
// the thunk body, exactly how a caller would model it. Each invalid sample breaks
// one field; the format-payload asserts only need the format NAME (uuid / email) to
// surface, so the expectations stay robust against incidental envelope fields.
//
// The doc-gen's synthetic compile re-exports the real format brand aliases into the
// probe (see FORMATS_MODULE in scripts/export-*-suite.mjs), so the generated-code hover
// shows the actual format handling (uuid / email checks here), matching the runtime
// validator. `pureType` shows the real branded interface and `schema` the RT builder.
import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {FormatEmail, FormatUUIDv4} from '@mionjs/ts-go-run-types/formats';

export const REALWORLD = {
  user: {
    title: 'User',
    description: 'A DTO whose id is a `FormatUUIDv4` and whose email is a `FormatEmail`; the plain `name` rides alongside as a normal string.',
    validateNotes: [
      'The `id` must be a version-4 UUID and `email` a valid email — a plain string that is structurally fine still fails the format check.',
      'Structural — extra properties beyond the declared shape PASS.',
    ],
    validate: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createValidate<User>();
    },
    validateDataOnly: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createValidate<DataOnly<User>>();
    },
    validateSchema: () => createValidate(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    deserializeValidate: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return deserializeValidate<User>();
    },
    validateReflect: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      const v: User = {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as FormatUUIDv4, name: 'Ada Lovelace', email: 'ada@example.com' as FormatEmail};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      const v: User = {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as FormatUUIDv4, name: 'Ada Lovelace', email: 'ada@example.com' as FormatEmail};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createGetValidationErrors<User>();
    },
    getValidationErrorsDataOnly: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createGetValidationErrors<DataOnly<User>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({id: RT.uuidv4(), name: RT.string(), email: RT.email()})),
    deserializeGetValidationErrors: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return deserializeGetValidationErrors<User>();
    },
    getValidationErrorsReflect: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      const v: User = {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as FormatUUIDv4, name: 'Ada Lovelace', email: 'ada@example.com' as FormatEmail};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      const v: User = {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as FormatUUIDv4, name: 'Ada Lovelace', email: 'ada@example.com' as FormatEmail};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      return createMockType<User>();
    },
    mockTypeReflect: () => {
      interface User {id: FormatUUIDv4; name: string; email: FormatEmail}
      const v: User = {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f' as FormatUUIDv4, name: 'Ada Lovelace', email: 'ada@example.com' as FormatEmail};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada Lovelace', email: 'ada@example.com'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', name: '', email: 'ab@cd.co'},
      ],
      invalid: [
        null,
        {id: 'not-a-uuid', name: 'Ada', email: 'ada@example.com'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 'Ada', email: 'not-an-email'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', name: 42, email: 'ada@example.com'},
      ],
    }),
    expectedFormatErrors: () => [null, {name: 'uuid'}, {name: 'email'}, null],
  },

  order: {
    title: 'Order',
    description: 'A DTO mixing two formats (a `FormatUUIDv4` id and a `FormatEmail` contact) with a numeric total and a string-literal status union.',
    validateNotes: 'A malformed email or a non-v4 uuid surfaces its named format error; an out-of-set status fails the union.',
    validate: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createValidate<Order>();
    },
    validateDataOnly: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createValidate<DataOnly<Order>>();
    },
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    deserializeValidate: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return deserializeValidate<Order>();
    },
    validateReflect: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      const v: Order = {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as FormatUUIDv4, email: 'ada@example.com' as FormatEmail, total: 78, status: 'paid'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      const v: Order = {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as FormatUUIDv4, email: 'ada@example.com' as FormatEmail, total: 78, status: 'paid'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createGetValidationErrors<Order>();
    },
    getValidationErrorsDataOnly: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createGetValidationErrors<DataOnly<Order>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          id: RT.uuidv4(),
          email: RT.email(),
          total: RT.number(),
          status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('cancelled')]),
        })
      ),
    deserializeGetValidationErrors: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return deserializeGetValidationErrors<Order>();
    },
    getValidationErrorsReflect: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      const v: Order = {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as FormatUUIDv4, email: 'ada@example.com' as FormatEmail, total: 78, status: 'paid'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      const v: Order = {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as FormatUUIDv4, email: 'ada@example.com' as FormatEmail, total: 78, status: 'paid'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      return createMockType<Order>();
    },
    mockTypeReflect: () => {
      interface Order {id: FormatUUIDv4; email: FormatEmail; total: number; status: 'pending' | 'paid' | 'shipped' | 'cancelled'}
      const v: Order = {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff' as FormatUUIDv4, email: 'ada@example.com' as FormatEmail, total: 78, status: 'paid'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'ada@example.com', total: 78, status: 'paid'},
        {id: '0d8f2b1c-1e2a-4d3b-9f4c-5a6b7c8d9e0f', email: 'ab@cd.co', total: 0, status: 'pending'},
      ],
      invalid: [
        null,
        {id: 'not-a-uuid', email: 'ada@example.com', total: 78, status: 'paid'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'not-an-email', total: 78, status: 'paid'},
        {id: '6f9619ff-8b86-4011-b42d-00cf4fc964ff', email: 'ada@example.com', total: 78, status: 'refunded'},
      ],
    }),
    expectedFormatErrors: () => [null, {name: 'uuid'}, {name: 'email'}, null],
  },
} as const satisfies Record<string, FormatValidationCase>;

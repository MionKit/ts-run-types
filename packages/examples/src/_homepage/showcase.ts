import type * as TF from 'ts-runtypes/formats';
import {
  createValidate,
  createGetValidationErrors,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  createMockType,
  createStandardSchema,
} from 'ts-runtypes';

// start-type
// One real-world type — the single source of truth for everything below.
type Order = {
  id: TF.UUIDv4;
  customer: {name: string; email: TF.Email};
  items: {sku: string; qty: number; price: number}[];
  total: number;
  placedAt: Date;
  status: 'pending' | 'paid' | 'shipped';
};
// end-type

const order: Order = {
  id: '6f9619ff-8b86-d011-b42d-00cf4fc964ff' as TF.UUIDv4,
  customer: {name: 'Ada', email: 'ada@example.com' as TF.Email},
  items: [{sku: 'TS-7', qty: 1, price: 42}],
  total: 42,
  placedAt: new Date(),
  status: 'paid',
};

// start-validate
const isOrder = createValidate<Order>();
isOrder(order); // true

const orderErrors = createGetValidationErrors<Order>();
orderErrors({...order, total: 'free'}); // [{path: ['total'], expected: 'number'}]
// end-validate

// start-json
const toJson = createJsonEncoder<Order>();
const fromJson = createJsonDecoder<Order>();

const wire = toJson(order); // Date -> string, ready for the network
const back = fromJson(wire); // string -> Date again, typed as DataOnly<Order>
// end-json

// start-binary
const toBytes = createBinaryEncoder<Order>();
const fromBytes = createBinaryDecoder<Order>();

const bytes = toBytes(order); // a compact binary buffer — smaller than JSON
const order2 = fromBytes(bytes); // back to a typed object
// end-binary

// start-mock
const mockOrder = createMockType<Order>();
const fake = mockOrder(); // a valid, randomized Order for your tests
// end-mock

// start-standard
const orderSchema = createStandardSchema<Order>();

// a Standard Schema v1 object — hand it to any tool that speaks the spec
orderSchema['~standard'].validate(order); // {value: order}
orderSchema['~standard'].validate({}); // {issues: [{message, path}, …]}
// end-standard

export {order, back, order2, fake, orderSchema};

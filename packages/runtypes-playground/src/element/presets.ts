// Predefined example types for the playground, each available in TWO forms:
//   - `ts`: a plain TypeScript type (resolved via `createX<MyType>()`). Where it
//     helps, fields use type formats imported from `ts-runtypes/formats`
//     (Email, UUIDv4, Positive, …) — the import is written out so it reads like
//     real code and drives format-aware validate / mock / generated code.
//   - `schema`: the value-first ts-runtypes/schema + ts-runtypes/formats builder
//     form (resolved via `createX(MyType)`), with its RT / TF imports written out
//     just like the type form, so both read like real code.
// The TS/Schema switch toggles which form the editor shows. The shapes mirror the
// real-world DTO scenarios in the validation suite
// (packages/ts-runtypes/test/suites/validation/Realworld.ts).

export interface Preset {
  name: string;
  ts: string;
  schema: string;
  // A matching sample value (JSON) for the input pane.
  input: string;
}

export const PRESETS: readonly Preset[] = [
  {
    name: 'Simple',
    ts: `type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`,
    schema: `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  active: RT.optional(RT.boolean()),
});`,
    input: `{
  "id": 1,
  "name": "ada",
  "tags": ["math", "code"],
  "active": true
}`,
  },
  {
    name: 'User',
    ts: `import type { Email, UUIDv4, PositiveInt } from 'ts-runtypes/formats';

type MyType = {
  id: UUIDv4;
  email: Email;
  name: string;
  age?: PositiveInt;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
};`,
    schema: `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  name: TF.string(),
  age: RT.optional(TF.positiveInt()),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
  active: RT.boolean(),
  createdAt: TF.string(),
});`,
    input: `{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "email": "ann@example.com",
  "name": "Ann",
  "age": 30,
  "roles": ["user"],
  "active": true,
  "createdAt": "2024-01-02"
}`,
  },
  {
    name: 'Order',
    ts: `import type { Email, Positive } from 'ts-runtypes/formats';

type MyType = {
  id: string;
  customer: { id: number; email: Email };
  items: { sku: string; name: string; qty: number; price: Positive }[];
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: Positive;
  note?: string;
};`,
    schema: `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.string(),
  customer: RT.object({ id: TF.number(), email: TF.email() }),
  items: RT.array(
    RT.object({ sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.positive() })
  ),
  status: RT.union([
    RT.literal('pending'),
    RT.literal('paid'),
    RT.literal('shipped'),
    RT.literal('delivered'),
    RT.literal('cancelled'),
  ]),
  total: TF.positive(),
  note: RT.optional(TF.string()),
});`,
    input: `{
  "id": "ord_1001",
  "customer": { "id": 7, "email": "ann@example.com" },
  "items": [{ "sku": "SKU-1", "name": "Widget", "qty": 2, "price": 9.99 }],
  "status": "paid",
  "total": 19.98
}`,
  },
  {
    name: 'BlogPost',
    ts: `import type { Email, Integer } from 'ts-runtypes/formats';

type MyType = {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  author: { name: string; email: Email };
  published: boolean;
  meta: { views: Integer; likes: Integer };
};`,
    schema: `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.number(),
  title: TF.string(),
  slug: TF.string(),
  tags: RT.array(TF.string()),
  author: RT.object({ name: TF.string(), email: TF.email() }),
  published: RT.boolean(),
  meta: RT.object({ views: TF.integer(), likes: TF.integer() }),
});`,
    input: `{
  "id": 42,
  "title": "Hello RunTypes",
  "slug": "hello-runtypes",
  "tags": ["typescript", "validation"],
  "author": { "name": "Ann", "email": "ann@example.com" },
  "published": true,
  "meta": { "views": 1200, "likes": 88 }
}`,
  },
  {
    name: 'Product',
    ts: `import type { Positive, Url } from 'ts-runtypes/formats';

type MyType = {
  id: string;
  name: string;
  price: Positive;
  url: Url;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
};`,
    schema: `import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.string(),
  name: TF.string(),
  price: TF.positive(),
  url: TF.url(),
  currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
  inStock: RT.boolean(),
  categories: RT.array(TF.string()),
});`,
    input: `{
  "id": "prod_55",
  "name": "Mechanical Keyboard",
  "price": 129.95,
  "url": "https://shop.example.com/keyboard",
  "currency": "USD",
  "inStock": true,
  "categories": ["peripherals", "keyboards"]
}`,
  },
];

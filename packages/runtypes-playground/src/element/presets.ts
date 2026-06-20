// Predefined example types for the playground, each available in TWO forms:
//   - `ts`: a plain TypeScript type (resolved via `createX<MyType>()`)
//   - `schema`: the value-first ts-runtypes/schema + ts-runtypes/formats builder
//     form (resolved via `createX(MyType)`)
// The TS/Schema switch toggles which form the editor shows. The shapes mirror the
// real-world DTO scenarios in the validation suite
// (packages/ts-runtypes/test/suites/validation/Realworld.ts).
//
// The schema form omits the imports — the engine injects
// `import * as RT from 'ts-runtypes/schema'` + `import * as TF from 'ts-runtypes/formats'`.

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
    schema: `const MyType = RT.object({
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
    ts: `type MyType = {
  id: number;
  email: string;
  name: string;
  age?: number;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
};`,
    schema: `const MyType = RT.object({
  id: TF.number(),
  email: TF.string(),
  name: TF.string(),
  age: RT.optional(TF.number()),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
  active: RT.boolean(),
  createdAt: TF.string(),
});`,
    input: `{
  "id": 1,
  "email": "ann@example.com",
  "name": "Ann",
  "roles": ["user"],
  "active": true,
  "createdAt": "2024-01-02"
}`,
  },
  {
    name: 'Order',
    ts: `type MyType = {
  id: string;
  customer: { id: number; email: string };
  items: { sku: string; name: string; qty: number; price: number }[];
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
};`,
    schema: `const MyType = RT.object({
  id: TF.string(),
  customer: RT.object({ id: TF.number(), email: TF.string() }),
  items: RT.array(
    RT.object({ sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.number() })
  ),
  status: RT.union([
    RT.literal('pending'),
    RT.literal('paid'),
    RT.literal('shipped'),
    RT.literal('delivered'),
    RT.literal('cancelled'),
  ]),
  total: TF.number(),
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
    ts: `type MyType = {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  author: { name: string; email: string };
  published: boolean;
  meta: { views: number; likes: number };
};`,
    schema: `const MyType = RT.object({
  id: TF.number(),
  title: TF.string(),
  slug: TF.string(),
  tags: RT.array(TF.string()),
  author: RT.object({ name: TF.string(), email: TF.string() }),
  published: RT.boolean(),
  meta: RT.object({ views: TF.number(), likes: TF.number() }),
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
    ts: `type MyType = {
  id: string;
  name: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
};`,
    schema: `const MyType = RT.object({
  id: TF.string(),
  name: TF.string(),
  price: TF.number(),
  currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
  inStock: RT.boolean(),
  categories: RT.array(TF.string()),
});`,
    input: `{
  "id": "prod_55",
  "name": "Mechanical Keyboard",
  "price": 129.95,
  "currency": "USD",
  "inStock": true,
  "categories": ["peripherals", "keyboards"]
}`,
  },
];

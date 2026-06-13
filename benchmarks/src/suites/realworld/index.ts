// Real-world DTO scenarios — the kind of relational / form / CMS / API shapes a
// typical app validates on the wire. Authored for the benchmark (not vendored
// from the package), but in the same case shape so it flows through both the
// runtime validation benchmark and the type-instantiation (typecost) benchmark.
//
// Each case provides ts-go-run-types' two forms — `validate` (type-definition,
// `createValidate<T>()`) and `validateSchema` (value-first, `createValidate(RT.…)`)
// — plus samples. Competitor schemas live in src/competitors/*.ts keyed
// `REALWORLD.<case>`.

import {createValidate} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';

// ── Types (relational / CMS / API / form) ───────────────────────────────────

export interface User {
  id: number;
  email: string;
  name: string;
  age?: number;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  customer: {id: number; email: string};
  items: OrderItem[];
  shipping: Address;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  body: string;
  tags: string[];
  author: {name: string; email: string};
  published: boolean;
  publishedAt?: string;
  meta: {views: number; likes: number};
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
  dimensions?: {width: number; height: number; depth: number};
}

export interface ProductPage {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface RegistrationForm {
  email: string;
  password: string;
  acceptedTerms: true;
  profile: {firstName: string; lastName: string; age?: number};
}

// ── Cases ────────────────────────────────────────────────────────────────────

const sampleUser = (over: Partial<User> = {}): User => ({
  id: 1,
  email: 'ann@example.com',
  name: 'Ann',
  roles: ['user'],
  active: true,
  createdAt: '2024-01-02',
  ...over,
});

export const REALWORLD = {
  user: {
    validate: () => createValidate<User>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.number(),
          email: RT.string(),
          name: RT.string(),
          age: RT.optional(RT.number()),
          roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
          active: RT.boolean(),
          createdAt: RT.string(),
        })
      ),
    getSamples: () => ({
      valid: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})],
      invalid: [
        sampleUser({roles: ['superuser'] as never}),
        sampleUser({id: '1' as never}),
        {email: 'x', name: 'x', roles: [], active: true, createdAt: 'x'},
        null,
      ],
    }),
  },

  order: {
    validate: () => createValidate<Order>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.string(),
          customer: RT.object({id: RT.number(), email: RT.string()}),
          items: RT.array(
            RT.object({sku: RT.string(), name: RT.string(), qty: RT.number(), price: RT.number()}),
          ),
          shipping: RT.object({
            street: RT.string(),
            city: RT.string(),
            state: RT.string(),
            zip: RT.string(),
            country: RT.string(),
          }),
          status: RT.union([
            RT.literal('pending'),
            RT.literal('paid'),
            RT.literal('shipped'),
            RT.literal('delivered'),
            RT.literal('cancelled'),
          ]),
          total: RT.number(),
          note: RT.optional(RT.string()),
        })
      ),
    getSamples: () => {
      const shipping: Address = {street: '1 Main', city: 'Springfield', state: 'IL', zip: '00001', country: 'US'};
      const ok: Order = {
        id: 'ord_1',
        customer: {id: 1, email: 'ann@example.com'},
        items: [{sku: 'A1', name: 'Widget', qty: 2, price: 9.99}],
        shipping,
        status: 'paid',
        total: 19.98,
      };
      return {
        valid: [ok, {...ok, note: 'gift', status: 'shipped' as const}],
        invalid: [
          {...ok, status: 'refunded'},
          {...ok, items: [{sku: 'A1', name: 'Widget', qty: 2}]},
          {...ok, customer: {id: 1}},
          {...ok, total: 'free'},
          null,
        ],
      };
    },
  },

  blogPost: {
    validate: () => createValidate<BlogPost>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.number(),
          title: RT.string(),
          slug: RT.string(),
          body: RT.string(),
          tags: RT.array(RT.string()),
          author: RT.object({name: RT.string(), email: RT.string()}),
          published: RT.boolean(),
          publishedAt: RT.optional(RT.string()),
          meta: RT.object({views: RT.number(), likes: RT.number()}),
        })
      ),
    getSamples: () => {
      const ok: BlogPost = {
        id: 1,
        title: 'Hello',
        slug: 'hello',
        body: '…',
        tags: ['intro'],
        author: {name: 'Ann', email: 'ann@example.com'},
        published: true,
        meta: {views: 10, likes: 2},
      };
      return {
        valid: [ok, {...ok, publishedAt: '2024-01-02'}],
        invalid: [
          {...ok, tags: [1, 2]},
          {...ok, meta: {views: 10}},
          {...ok, published: 'yes'},
          null,
        ],
      };
    },
  },

  product: {
    validate: () => createValidate<Product>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.string(),
          name: RT.string(),
          description: RT.string(),
          price: RT.number(),
          currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
          inStock: RT.boolean(),
          categories: RT.array(RT.string()),
          dimensions: RT.optional(
            RT.object({width: RT.number(), height: RT.number(), depth: RT.number()}),
          ),
        })
      ),
    getSamples: () => {
      const ok: Product = {
        id: 'p1',
        name: 'Widget',
        description: 'A widget',
        price: 9.99,
        currency: 'USD',
        inStock: true,
        categories: ['tools'],
      };
      return {
        valid: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}],
        invalid: [
          {...ok, currency: 'JPY'},
          {...ok, dimensions: {width: 1, height: 2}},
          {...ok, price: '9.99'},
          null,
        ],
      };
    },
  },

  productPage: {
    validate: () => createValidate<ProductPage>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          data: RT.array(
            RT.object({
              id: RT.string(),
              name: RT.string(),
              description: RT.string(),
              price: RT.number(),
              currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
              inStock: RT.boolean(),
              categories: RT.array(RT.string()),
              dimensions: RT.optional(
                RT.object({width: RT.number(), height: RT.number(), depth: RT.number()}),
              ),
            }),
          ),
          page: RT.number(),
          pageSize: RT.number(),
          total: RT.number(),
          hasMore: RT.boolean(),
        })
      ),
    getSamples: () => {
      const p: Product = {
        id: 'p1',
        name: 'Widget',
        description: 'A widget',
        price: 9.99,
        currency: 'USD',
        inStock: true,
        categories: ['tools'],
      };
      const ok: ProductPage = {data: [p], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {
        valid: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}],
        invalid: [
          {...ok, data: [{...p, currency: 'JPY'}]},
          {...ok, hasMore: 'no'},
          {...ok, page: '1'},
          null,
        ],
      };
    },
  },

  registrationForm: {
    validate: () => createValidate<RegistrationForm>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          email: RT.string(),
          password: RT.string(),
          acceptedTerms: RT.literal(true),
          profile: RT.object({
            firstName: RT.string(),
            lastName: RT.string(),
            age: RT.optional(RT.number()),
          }),
        })
      ),
    getSamples: () => {
      const ok: RegistrationForm = {
        email: 'ann@example.com',
        password: 'hunter2hunter2',
        acceptedTerms: true,
        profile: {firstName: 'Ann', lastName: 'Smith'},
      };
      return {
        valid: [ok, {...ok, profile: {...ok.profile, age: 30}}],
        invalid: [
          {...ok, acceptedTerms: false},
          {...ok, profile: {firstName: 'Ann'}},
          {...ok, password: 123456},
          null,
        ],
      };
    },
  },
};

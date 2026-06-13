// Real-world DTO scenarios — slim, marker-free copy. Only the named
// interfaces (imported by the ts-go / typia competitors) plus per-case
// samples remain; the createValidate / RT.* thunks are dropped so a
// competitor importing these never transitively pulls the marker package.

import type {SharedCase} from '../types.ts';

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
        invalid: [{...ok, tags: [1, 2]}, {...ok, meta: {views: 10}}, {...ok, published: 'yes'}, null],
      };
    },
  },
  product: {
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
        invalid: [{...ok, currency: 'JPY'}, {...ok, dimensions: {width: 1, height: 2}}, {...ok, price: '9.99'}, null],
      };
    },
  },
  productPage: {
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
        invalid: [{...ok, data: [{...p, currency: 'JPY'}]}, {...ok, hasMore: 'no'}, {...ok, page: '1'}, null],
      };
    },
  },
  registrationForm: {
    getSamples: () => {
      const ok: RegistrationForm = {
        email: 'ann@example.com',
        password: 'hunter2hunter2',
        acceptedTerms: true,
        profile: {firstName: 'Ann', lastName: 'Smith'},
      };
      return {
        valid: [ok, {...ok, profile: {...ok.profile, age: 30}}],
        invalid: [{...ok, acceptedTerms: false}, {...ok, profile: {firstName: 'Ann'}}, {...ok, password: 123456}, null],
      };
    },
  },
  // Realworld cases carry samples only (no title/description) — mirror the old
  // src/suites/realworld plain-object typing; the runner reads getSamples alone.
} as const satisfies Record<string, Pick<SharedCase, 'getSamples'>>;

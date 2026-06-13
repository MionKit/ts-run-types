import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

// Real-world DTO scenarios — the SAME relational / CMS / API / form shapes the
// realworld benchmark runs (benchmarks/shared/cases/realworld), so the serialization
// suite table lines up case-for-case with the benchmark. The module interfaces are the
// single source of truth; each case's `cloneEncoder` (the strategy the docs render)
// redeclares its type INLINE so the doc-gen extracts a real, self-contained snippet,
// while the rest reference the module interfaces. Every shape is fully JSON / binary
// serializable, so round-trips are symmetric (no `deserializedValues`).

interface User {
  id: number;
  email: string;
  name: string;
  age?: number;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
}
interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}
interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
}
interface Order {
  id: string;
  customer: {id: number; email: string};
  items: OrderItem[];
  shipping: Address;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: number;
  note?: string;
}
interface BlogPost {
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
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
  dimensions?: {width: number; height: number; depth: number};
}
interface ProductPage {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
interface RegistrationForm {
  email: string;
  password: string;
  acceptedTerms: true;
  profile: {firstName: string; lastName: string; age?: number};
}

const userSchema = () =>
  RT.object({
    id: RT.number(),
    email: RT.string(),
    name: RT.string(),
    age: RT.optional(RT.number()),
    roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
    active: RT.boolean(),
    createdAt: RT.string(),
  });
const orderSchema = () =>
  RT.object({
    id: RT.string(),
    customer: RT.object({id: RT.number(), email: RT.string()}),
    items: RT.array(RT.object({sku: RT.string(), name: RT.string(), qty: RT.number(), price: RT.number()})),
    shipping: RT.object({street: RT.string(), city: RT.string(), state: RT.string(), zip: RT.string(), country: RT.string()}),
    status: RT.union([RT.literal('pending'), RT.literal('paid'), RT.literal('shipped'), RT.literal('delivered'), RT.literal('cancelled')]),
    total: RT.number(),
    note: RT.optional(RT.string()),
  });
const productModel = () =>
  RT.object({
    id: RT.string(),
    name: RT.string(),
    description: RT.string(),
    price: RT.number(),
    currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
    inStock: RT.boolean(),
    categories: RT.array(RT.string()),
    dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
  });
const blogPostSchema = () =>
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
  });
const productPageSchema = () =>
  RT.object({data: RT.array(productModel()), page: RT.number(), pageSize: RT.number(), total: RT.number(), hasMore: RT.boolean()});
const registrationFormSchema = () =>
  RT.object({
    email: RT.string(),
    password: RT.string(),
    acceptedTerms: RT.literal(true),
    profile: RT.object({firstName: RT.string(), lastName: RT.string(), age: RT.optional(RT.number())}),
  });

export const REALWORLD = {
  user: {
    title: 'user',
    description: 'A relational user record: numeric id, email, name, an optional age, a roles union array, an active flag and a createdAt string.',
    cloneEncoder: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createJsonEncoder<User>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<User>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<User>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<User>(),
    preserveDecoder: () => createJsonDecoder<User>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<User>(),
    binaryDecoder: () => createBinaryDecoder<User>(),
    schemaEncoder: () => createJsonEncoder(userSchema()),
    schemaDecoder: () => createJsonDecoder(userSchema()),
    schemaBinaryEncoder: () => createBinaryEncoder(userSchema()),
    schemaBinaryDecoder: () => createBinaryDecoder(userSchema()),
    getTestData: () => ({values: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})]}),
  },

  order: {
    title: 'order',
    description: 'A nested order: an inline customer ref, an array of line items, a shipping address, a status union, a total, and an optional note.',
    cloneEncoder: () => {
      interface OrderItem {
        sku: string;
        name: string;
        qty: number;
        price: number;
      }
      interface Address {
        street: string;
        city: string;
        state: string;
        zip: string;
        country: string;
      }
      interface Order {
        id: string;
        customer: {id: number; email: string};
        items: OrderItem[];
        shipping: Address;
        status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
        total: number;
        note?: string;
      }
      return createJsonEncoder<Order>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<Order>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<Order>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Order>(),
    preserveDecoder: () => createJsonDecoder<Order>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Order>(),
    binaryDecoder: () => createBinaryDecoder<Order>(),
    schemaEncoder: () => createJsonEncoder(orderSchema()),
    schemaDecoder: () => createJsonDecoder(orderSchema()),
    schemaBinaryEncoder: () => createBinaryEncoder(orderSchema()),
    schemaBinaryDecoder: () => createBinaryDecoder(orderSchema()),
    getTestData: () => {
      const ok = makeOrder();
      return {values: [ok, {...ok, note: 'gift', status: 'shipped' as const}]};
    },
  },

  blogPost: {
    title: 'blogPost',
    description: 'A CMS post: ids, slug, body, a tags array, an inline author, a published flag with optional publishedAt, and a nested meta counter object.',
    cloneEncoder: () => {
      interface BlogPost {
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
      return createJsonEncoder<BlogPost>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<BlogPost>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<BlogPost>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<BlogPost>(),
    preserveDecoder: () => createJsonDecoder<BlogPost>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<BlogPost>(),
    binaryDecoder: () => createBinaryDecoder<BlogPost>(),
    schemaEncoder: () => createJsonEncoder(blogPostSchema()),
    schemaDecoder: () => createJsonDecoder(blogPostSchema()),
    schemaBinaryEncoder: () => createBinaryEncoder(blogPostSchema()),
    schemaBinaryDecoder: () => createBinaryDecoder(blogPostSchema()),
    getTestData: () => {
      const ok = makeBlogPost();
      return {values: [ok, {...ok, publishedAt: '2024-01-02'}]};
    },
  },

  product: {
    title: 'product',
    description: 'A catalog product: a currency union, an inStock flag, a categories array, and an optional nested dimensions object.',
    cloneEncoder: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      return createJsonEncoder<Product>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<Product>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<Product>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Product>(),
    preserveDecoder: () => createJsonDecoder<Product>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Product>(),
    binaryDecoder: () => createBinaryDecoder<Product>(),
    schemaEncoder: () => createJsonEncoder(productModel()),
    schemaDecoder: () => createJsonDecoder(productModel()),
    schemaBinaryEncoder: () => createBinaryEncoder(productModel()),
    schemaBinaryDecoder: () => createBinaryDecoder(productModel()),
    getTestData: () => {
      const ok = makeProduct();
      return {values: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}]};
    },
  },

  productPage: {
    title: 'productPage',
    description: 'A paginated API response: an array of products plus page / pageSize / total / hasMore metadata.',
    cloneEncoder: () => {
      interface Product {
        id: string;
        name: string;
        description: string;
        price: number;
        currency: 'USD' | 'EUR' | 'GBP';
        inStock: boolean;
        categories: string[];
        dimensions?: {width: number; height: number; depth: number};
      }
      interface ProductPage {
        data: Product[];
        page: number;
        pageSize: number;
        total: number;
        hasMore: boolean;
      }
      return createJsonEncoder<ProductPage>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<ProductPage>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<ProductPage>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<ProductPage>(),
    preserveDecoder: () => createJsonDecoder<ProductPage>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<ProductPage>(),
    binaryDecoder: () => createBinaryDecoder<ProductPage>(),
    schemaEncoder: () => createJsonEncoder(productPageSchema()),
    schemaDecoder: () => createJsonDecoder(productPageSchema()),
    schemaBinaryEncoder: () => createBinaryEncoder(productPageSchema()),
    schemaBinaryDecoder: () => createBinaryDecoder(productPageSchema()),
    getTestData: () => {
      const ok: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {values: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}]};
    },
  },

  registrationForm: {
    title: 'registrationForm',
    description: 'A signup form: email, password, an `acceptedTerms: true` literal, and a nested profile with an optional age.',
    cloneEncoder: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createJsonEncoder<RegistrationForm>(undefined, {strategy: 'clone'});
    },
    mutateEncoder: () => createJsonEncoder<RegistrationForm>(undefined, {strategy: 'mutate'}),
    directEncoder: () => createJsonEncoder<RegistrationForm>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<RegistrationForm>(),
    preserveDecoder: () => createJsonDecoder<RegistrationForm>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<RegistrationForm>(),
    binaryDecoder: () => createBinaryDecoder<RegistrationForm>(),
    schemaEncoder: () => createJsonEncoder(registrationFormSchema()),
    schemaDecoder: () => createJsonDecoder(registrationFormSchema()),
    schemaBinaryEncoder: () => createBinaryEncoder(registrationFormSchema()),
    schemaBinaryDecoder: () => createBinaryDecoder(registrationFormSchema()),
    getTestData: () => {
      const ok = makeRegistrationForm();
      return {values: [ok, {...ok, profile: {...ok.profile, age: 30}}]};
    },
  },
} as const satisfies Record<string, SerializationCase>;

const sampleUser = (over: Partial<User> = {}): User => ({
  id: 1,
  email: 'ann@example.com',
  name: 'Ann',
  roles: ['user'],
  active: true,
  createdAt: '2024-01-02',
  ...over,
});
function makeOrder(): Order {
  return {
    id: 'ord_1',
    customer: {id: 1, email: 'ann@example.com'},
    items: [{sku: 'A1', name: 'Widget', qty: 2, price: 9.99}],
    shipping: {street: '1 Main', city: 'Springfield', state: 'IL', zip: '00001', country: 'US'},
    status: 'paid',
    total: 19.98,
  };
}
function makeBlogPost(): BlogPost {
  return {
    id: 1,
    title: 'Hello',
    slug: 'hello',
    body: '…',
    tags: ['intro'],
    author: {name: 'Ann', email: 'ann@example.com'},
    published: true,
    meta: {views: 10, likes: 2},
  };
}
function makeProduct(): Product {
  return {id: 'p1', name: 'Widget', description: 'A widget', price: 9.99, currency: 'USD', inStock: true, categories: ['tools']};
}
function makeRegistrationForm(): RegistrationForm {
  return {email: 'ann@example.com', password: 'hunter2hunter2', acceptedTerms: true, profile: {firstName: 'Ann', lastName: 'Smith'}};
}

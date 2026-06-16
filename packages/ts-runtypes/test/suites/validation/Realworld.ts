import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

// Real-world DTO scenarios — the SAME relational / CMS / API / form shapes the
// realworld benchmark runs (benchmarks/shared/cases/realworld), so the suite table
// and the benchmark table line up case-for-case. The module interfaces below are the
// single source of truth; the `validate` thunk of each case redeclares its type INLINE
// (best-practice TS, and what the doc-gen extracts + renders in the hover), while the
// remaining thunks reference the module interfaces to keep these composed DTOs readable.

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
    title: 'User',
    description:
      'A relational user record with a numeric id, email, name, optional age, a roles union array, an active flag and a createdAt string.',
    validate: () => {
      interface User {
        id: number;
        email: string;
        name: string;
        age?: number;
        roles: ('admin' | 'editor' | 'user')[];
        active: boolean;
        createdAt: string;
      }
      return createValidate<User>();
    },
    validateDataOnly: () => createValidate<DataOnly<User>>(),
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
    deserializeValidate: () => deserializeValidate<User>(),
    validateReflect: () => {
      const v: User = sampleUser();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: User = sampleUser();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<User>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<User>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
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
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<User>(),
    getValidationErrorsReflect: () => {
      const v: User = sampleUser();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: User = sampleUser();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<User>(),
    mockTypeReflect: () => {
      const v: User = sampleUser();
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [sampleUser(), sampleUser({age: 30, roles: ['admin', 'editor']})],
      invalid: [
        sampleUser({roles: ['superuser'] as never}),
        sampleUser({id: '1' as never}),
        {email: 'x', name: 'x', roles: [], active: true, createdAt: 'x'},
        null,
        'not-an-object',
        42,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['roles', 0], expected: 'union'}],
      [{path: ['id'], expected: 'number'}],
      [{path: ['id'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  order: {
    title: 'Order',
    description:
      'A nested order with an inline customer ref, an array of line items, a shipping address, a status union, a total, and an optional note.',
    validate: () => {
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
      return createValidate<Order>();
    },
    validateDataOnly: () => createValidate<DataOnly<Order>>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          id: RT.string(),
          customer: RT.object({id: RT.number(), email: RT.string()}),
          items: RT.array(RT.object({sku: RT.string(), name: RT.string(), qty: RT.number(), price: RT.number()})),
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
    deserializeValidate: () => deserializeValidate<Order>(),
    validateReflect: () => {
      const v: Order = makeOrder();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Order = makeOrder();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Order>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Order>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          id: RT.string(),
          customer: RT.object({id: RT.number(), email: RT.string()}),
          items: RT.array(RT.object({sku: RT.string(), name: RT.string(), qty: RT.number(), price: RT.number()})),
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
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Order>(),
    getValidationErrorsReflect: () => {
      const v: Order = makeOrder();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Order = makeOrder();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Order>(),
    mockTypeReflect: () => {
      const v: Order = makeOrder();
      return createMockType(v);
    },
    getSamples: () => {
      const ok = makeOrder();
      return {
        valid: [ok, {...ok, note: 'gift', status: 'shipped' as const}],
        invalid: [
          {...ok, status: 'refunded'},
          {...ok, items: [{sku: 'A1', name: 'Widget', qty: 2}]},
          {...ok, customer: {id: 1}},
          {...ok, total: 'free'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['status'], expected: 'union'}],
      [{path: ['items', 0, 'price'], expected: 'number'}],
      [{path: ['customer', 'email'], expected: 'string'}],
      [{path: ['total'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  blogPost: {
    title: 'Blog post',
    description:
      'A CMS post with ids, slug, body, a tags array, an inline author, a published flag with optional publishedAt, and a nested meta counter object.',
    validate: () => {
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
      return createValidate<BlogPost>();
    },
    validateDataOnly: () => createValidate<DataOnly<BlogPost>>(),
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
    deserializeValidate: () => deserializeValidate<BlogPost>(),
    validateReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: BlogPost = makeBlogPost();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<BlogPost>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<BlogPost>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
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
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<BlogPost>(),
    getValidationErrorsReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: BlogPost = makeBlogPost();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<BlogPost>(),
    mockTypeReflect: () => {
      const v: BlogPost = makeBlogPost();
      return createMockType(v);
    },
    getSamples: () => {
      const ok = makeBlogPost();
      return {
        valid: [ok, {...ok, publishedAt: '2024-01-02'}],
        invalid: [{...ok, tags: [1, 2]}, {...ok, meta: {views: 10}}, {...ok, published: 'yes'}, null, 'not-an-object', 42],
      };
    },
    getExpectedErrors: () => [
      [
        {path: ['tags', 0], expected: 'string'},
        {path: ['tags', 1], expected: 'string'},
      ],
      [{path: ['meta', 'likes'], expected: 'number'}],
      [{path: ['published'], expected: 'boolean'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  product: {
    title: 'Product',
    description:
      'A catalog product with a currency union, an inStock flag, a categories array, and an optional nested dimensions object.',
    validate: () => {
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
      return createValidate<Product>();
    },
    validateDataOnly: () => createValidate<DataOnly<Product>>(),
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
          dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
        })
      ),
    deserializeValidate: () => deserializeValidate<Product>(),
    validateReflect: () => {
      const v: Product = makeProduct();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Product = makeProduct();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Product>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Product>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          id: RT.string(),
          name: RT.string(),
          description: RT.string(),
          price: RT.number(),
          currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
          inStock: RT.boolean(),
          categories: RT.array(RT.string()),
          dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Product>(),
    getValidationErrorsReflect: () => {
      const v: Product = makeProduct();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Product = makeProduct();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Product>(),
    mockTypeReflect: () => {
      const v: Product = makeProduct();
      return createMockType(v);
    },
    getSamples: () => {
      const ok = makeProduct();
      return {
        valid: [ok, {...ok, dimensions: {width: 1, height: 2, depth: 3}}],
        invalid: [
          {...ok, currency: 'JPY'},
          {...ok, dimensions: {width: 1, height: 2}},
          {...ok, price: '9.99'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['currency'], expected: 'union'}],
      [{path: ['dimensions', 'depth'], expected: 'number'}],
      [{path: ['price'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  productPage: {
    title: 'Product page',
    description: 'A paginated API response with an array of products plus page / pageSize / total / hasMore metadata.',
    validate: () => {
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
      return createValidate<ProductPage>();
    },
    validateDataOnly: () => createValidate<DataOnly<ProductPage>>(),
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
              dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
            })
          ),
          page: RT.number(),
          pageSize: RT.number(),
          total: RT.number(),
          hasMore: RT.boolean(),
        })
      ),
    deserializeValidate: () => deserializeValidate<ProductPage>(),
    validateReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<ProductPage>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<ProductPage>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
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
              dimensions: RT.optional(RT.object({width: RT.number(), height: RT.number(), depth: RT.number()})),
            })
          ),
          page: RT.number(),
          pageSize: RT.number(),
          total: RT.number(),
          hasMore: RT.boolean(),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ProductPage>(),
    getValidationErrorsReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<ProductPage>(),
    mockTypeReflect: () => {
      const v: ProductPage = {data: [makeProduct()], page: 1, pageSize: 20, total: 1, hasMore: false};
      return createMockType(v);
    },
    getSamples: () => {
      const p = makeProduct();
      const ok: ProductPage = {data: [p], page: 1, pageSize: 20, total: 1, hasMore: false};
      return {
        valid: [ok, {data: [], page: 2, pageSize: 20, total: 0, hasMore: false}],
        invalid: [
          {...ok, data: [{...p, currency: 'JPY'}]},
          {...ok, hasMore: 'no'},
          {...ok, page: '1'},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['data', 0, 'currency'], expected: 'union'}],
      [{path: ['hasMore'], expected: 'boolean'}],
      [{path: ['page'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  registrationForm: {
    title: 'Registration form',
    description:
      'A signup form with email, password, an acceptedTerms literal that must be exactly true, and a nested profile with an optional age.',
    validate: () => {
      interface RegistrationForm {
        email: string;
        password: string;
        acceptedTerms: true;
        profile: {firstName: string; lastName: string; age?: number};
      }
      return createValidate<RegistrationForm>();
    },
    validateDataOnly: () => createValidate<DataOnly<RegistrationForm>>(),
    validateSchema: () =>
      createValidate(
        RT.object({
          email: RT.string(),
          password: RT.string(),
          acceptedTerms: RT.literal(true),
          profile: RT.object({firstName: RT.string(), lastName: RT.string(), age: RT.optional(RT.number())}),
        })
      ),
    deserializeValidate: () => deserializeValidate<RegistrationForm>(),
    validateReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<RegistrationForm>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<RegistrationForm>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          email: RT.string(),
          password: RT.string(),
          acceptedTerms: RT.literal(true),
          profile: RT.object({firstName: RT.string(), lastName: RT.string(), age: RT.optional(RT.number())}),
        })
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<RegistrationForm>(),
    getValidationErrorsReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<RegistrationForm>(),
    mockTypeReflect: () => {
      const v: RegistrationForm = makeRegistrationForm();
      return createMockType(v);
    },
    getSamples: () => {
      const ok = makeRegistrationForm();
      return {
        valid: [ok, {...ok, profile: {...ok.profile, age: 30}}],
        invalid: [
          {...ok, acceptedTerms: false},
          {...ok, profile: {firstName: 'Ann'}},
          {...ok, password: 123456},
          null,
          'not-an-object',
          42,
        ],
      };
    },
    getExpectedErrors: () => [
      [{path: ['acceptedTerms'], expected: 'literal'}],
      [{path: ['profile', 'lastName'], expected: 'string'}],
      [{path: ['password'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;

// Sample builders for the composite cases — kept out of the thunks so the table's
// valid/invalid rows stay terse while the validators above reference the interfaces.
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
  return {
    id: 'p1',
    name: 'Widget',
    description: 'A widget',
    price: 9.99,
    currency: 'USD',
    inStock: true,
    categories: ['tools'],
  };
}
function makeRegistrationForm(): RegistrationForm {
  return {
    email: 'ann@example.com',
    password: 'hunter2hunter2',
    acceptedTerms: true,
    profile: {firstName: 'Ann', lastName: 'Smith'},
  };
}

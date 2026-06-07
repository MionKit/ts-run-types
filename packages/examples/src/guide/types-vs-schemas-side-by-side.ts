import {createValidate, type Static} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';

// start-type
// Option A — a plain TypeScript type. Fastest path, nothing extra to write.
type Product = {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
};

const isProductA = createValidate<Product>();
// end-type

// start-schema
// Option B — the RT.* builders, if you like the Zod / TypeBox feel.
const productSchema = RT.object({
  id: RT.number(),
  name: RT.string(),
  tags: RT.array(RT.string()),
  status: RT.union([RT.literal('draft'), RT.literal('live')]),
});

// Recover the TypeScript type from the schema whenever you need it.
type ProductFromSchema = Static<typeof productSchema>;

const isProductB = createValidate(productSchema);
// end-schema

export {isProductA, isProductB};
export type {Product, ProductFromSchema};

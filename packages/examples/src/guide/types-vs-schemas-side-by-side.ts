import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// start-type
// Option A — a plain TypeScript type. Fastest path, nothing extra to write.
type Product = {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
};

const isProductA = createValidateFn<Product>();
// end-type

// start-schema
// Option B — the RT.* builders, if you like the Zod / TypeBox feel.
const productSchema = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  status: RT.union([RT.literal('draft'), RT.literal('live')]),
});

// Recover the TypeScript type from the schema whenever you need it.
type ProductFromSchema = InferType<typeof productSchema>;

const isProductB = createValidateFn(productSchema);
// end-schema

export {isProductA, isProductB};
export type {Product, ProductFromSchema};

// Family 2 — Types ⇄ Schemas duality. Mirrors guide/types-vs-schemas-*.ts.
// A plain type and the value-first RT.* schema builder resolve to the SAME
// validator, and Static<typeof schema> recovers the TypeScript type.
import * as TF from '@ts-runtypes/core/formats';
import {createValidate, type Static} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {type CheckResult, ok} from './check';

// Type-first.
export interface Product {
  id: number;
  name: string;
  tags: string[];
  status: 'draft' | 'live';
}
export const isProductTypeFirst = createValidate<Product>();

// Value-first — the same shape as an RT.* schema value.
export const productSchema = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  status: RT.union([RT.literal('draft'), RT.literal('live')]),
});
export const isProductSchemaFirst = createValidate(productSchema);

// Static maps the schema value back to a usable TypeScript type.
export type ProductFromSchema = Static<typeof productSchema>;
const home: ProductFromSchema = {id: 1, name: 'Widget', tags: ['a'], status: 'live'};

export function checkTypesVsSchemas(): CheckResult[] {
  const good: Product = {id: 1, name: 'Widget', tags: ['a', 'b'], status: 'draft'};
  const bad = {id: 'x', name: 5, tags: 'nope', status: 'archived'};
  return [
    ok('duality: type-first validator accepts a good value', isProductTypeFirst(good)),
    ok('duality: schema-first validator accepts a good value', isProductSchemaFirst(good)),
    ok('duality: both reject a bad value', !isProductTypeFirst(bad) && !isProductSchemaFirst(bad)),
    // Behavioral convergence: type-first and schema-first agree on the same inputs,
    // for both a good and a bad value — the type ⇄ schema duality.
    ok('duality: type-first and schema-first validators agree (good)', isProductTypeFirst(good) === isProductSchemaFirst(good)),
    ok('duality: type-first and schema-first validators agree (bad)', isProductTypeFirst(bad) === isProductSchemaFirst(bad)),
    ok('duality: Static<typeof schema> is a usable type', home.status === 'live'),
  ];
}

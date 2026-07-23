import * as TF from '@ts-runtypes/core/formats';
import {createValidateFn} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// Mix both in one file — a pure type nested inside a schema and back again.
type Money = {amount: number; currency: 'USD' | 'EUR'};

// A schema that references the plain type via RT.* leaves.
const invoice = RT.object({
  id: TF.string(),
  lines: RT.array(
    RT.object({
      sku: TF.string(),
      total: RT.object({amount: TF.number(), currency: RT.union([RT.literal('USD'), RT.literal('EUR')])}),
    })
  ),
});

const isMoney = createValidateFn<Money>();
const isInvoice = createValidateFn(invoice);

export {isMoney, isInvoice};

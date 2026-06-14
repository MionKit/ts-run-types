import {createValidate} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';

// Mix both in one file — a pure type nested inside a schema and back again.
type Money = {amount: number; currency: 'USD' | 'EUR'};

// A schema that references the plain type via RT.* leaves.
const invoice = RT.object({
  id: RT.string(),
  lines: RT.array(
    RT.object({
      sku: RT.string(),
      total: RT.object({amount: RT.number(), currency: RT.union([RT.literal('USD'), RT.literal('EUR')])}),
    })
  ),
});

const isMoney = createValidate<Money>();
const isInvoice = createValidate(invoice);

export {isMoney, isInvoice};

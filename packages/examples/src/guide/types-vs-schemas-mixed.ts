import * as TF from 'ts-runtypes/formats';
import {createValidate} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

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

const isMoney = createValidate<Money>();
const isInvoice = createValidate(invoice);

export {isMoney, isInvoice};

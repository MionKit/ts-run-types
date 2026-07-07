import * as TF from '@ts-runtypes/core/formats';
import {type Static} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// Build a schema as a value you can pass around, store, or compose.
const address = RT.object({
  street: TF.string(),
  city: TF.string(),
  zip: TF.string(),
});

// Static<typeof schema> hands you the TypeScript type back.
type Address = Static<typeof address>;

// Now `Address` is a normal type — use it anywhere.
const home: Address = {street: '1 Infinite Loop', city: 'Cupertino', zip: '95014'};

export {address, home};
export type {Address};

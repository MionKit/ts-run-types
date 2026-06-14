import {type Static} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';

// Build a schema as a value you can pass around, store, or compose.
const address = RT.object({
  street: RT.string(),
  city: RT.string(),
  zip: RT.string(),
});

// Static<typeof schema> hands you the TypeScript type back.
type Address = Static<typeof address>;

// Now `Address` is a normal type — use it anywhere.
const home: Address = {street: '1 Infinite Loop', city: 'Cupertino', zip: '95014'};

export {address, home};
export type {Address};

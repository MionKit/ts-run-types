import {createValidate, type Static} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';

// Prefer schemas? Describe the same shape with the RT.* builders (Zod / TypeBox style).
const userSchema = RT.object({
  id: RT.number(),
  name: RT.string(),
  email: RT.email(),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('user')])),
});

// Same validator, same result — your call.
const isUser = createValidate(userSchema);

// Recover the TypeScript type from the schema whenever you need it.
type User = Static<typeof userSchema>;

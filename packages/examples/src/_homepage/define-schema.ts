import * as TF from '@ts-runtypes/core/formats';
import {createValidate, type Static} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// Prefer schemas? Describe the same shape with the RT.* builders (Zod / TypeBox style).
const userSchema = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('user')])),
});

// Same validator, same result — your call.
const isUser = createValidate(userSchema);

// Recover the TypeScript type from the schema whenever you need it.
type User = Static<typeof userSchema>;

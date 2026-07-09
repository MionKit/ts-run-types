import * as TF from '@ts-runtypes/core/formats';
import {createValidate, type InferType} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// start-type
// Option A — a plain TypeScript type. Fastest, zero ceremony.
type UserFromType = {
  id: number;
  name: string;
  email: string;
};

const isUserA = createValidate<UserFromType>();
// end-type

// start-schema
// Option B — the RT.* builders, if you like the Zod / TypeBox feel.
const userSchema = RT.object({
  id: TF.number(),
  name: TF.string(),
  email: TF.email(),
});

// Recover the type from the schema whenever you need it.
type UserFromSchema = InferType<typeof userSchema>;

const isUserB = createValidate(userSchema);
// end-schema

export {isUserA, isUserB};
export type {UserFromSchema};

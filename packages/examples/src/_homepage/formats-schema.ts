import * as TF from '@ts-runtypes/core/formats';
import {createValidate, type Static} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// The same formats, schema-first — the RT.* builders.
const account = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  ip: TF.ipv4(),
  logins: TF.positiveInt(),
});

// Recover the TypeScript type from the schema.
type Account = Static<typeof account>;

const isAccount = createValidate(account);

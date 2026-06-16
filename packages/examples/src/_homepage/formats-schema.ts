import {createValidate, type Static} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

// The same formats, schema-first — the RT.* builders.
const account = RT.object({
  id: RT.uuidv4(),
  email: RT.email(),
  ip: RT.ipv4(),
  logins: RT.positiveInt(),
});

// Recover the TypeScript type from the schema.
type Account = Static<typeof account>;

const isAccount = createValidate(account);

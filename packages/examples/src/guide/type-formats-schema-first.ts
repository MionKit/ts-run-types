import {createValidate, type Static} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

// Schema-first formats: the same constraints as builders. RT.email(),
// RT.uuidv4(), RT.int32(), RT.positive() — pick the style you like.
const account = RT.object({
  id: RT.uuidv4(),
  email: RT.email(),
  age: RT.int32(),
  credits: RT.positive(),
});

// Static<typeof schema> hands the TypeScript type back.
type Account = Static<typeof account>;

const isAccount = createValidate(account);

export {account, isAccount};
export type {Account};

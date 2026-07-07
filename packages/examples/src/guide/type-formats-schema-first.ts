import * as TF from '@ts-runtypes/core/formats';
import {createValidate, type Static} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';

// Schema-first formats: the same constraints as builders. TF.email(),
// TF.uuidv4(), TF.int32(), TF.positive() — pick the style you like.
const account = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  age: TF.int32(),
  credits: TF.positive(),
});

// Static<typeof schema> hands the TypeScript type back.
type Account = Static<typeof account>;

const isAccount = createValidate(account);

export {account, isAccount};
export type {Account};

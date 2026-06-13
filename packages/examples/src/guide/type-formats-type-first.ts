import {createValidate} from 'ts-runtypes';
import type {FormatEmail, FormatUUIDv4, FormatInt32, FormatPositive} from 'ts-runtypes/formats';

// Type-first formats: import a Format* alias and annotate. The constraint
// lives in the type — the build reads it and validates accordingly.
type Account = {
  id: FormatUUIDv4;
  email: FormatEmail;
  age: FormatInt32;
  credits: FormatPositive;
};

const isAccount = createValidate<Account>();

isAccount({
  id: '109156be-c4fb-41ea-b1b4-efe1671c5836',
  email: 'ada@example.com',
  age: 36,
  credits: 100,
}); // true

isAccount({id: 'not-a-uuid', email: 'nope', age: 1.5, credits: -5}); // false

export {isAccount};
export type {Account};

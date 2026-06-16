import {createValidate} from '@mionjs/ts-go-run-types';
import type {
  FormatUUIDv4,
  FormatEmail,
  FormatIPv4,
  FormatPositiveInt,
} from '@mionjs/ts-go-run-types/formats';

// A format brands a string or number — the validator checks its exact
// shape, not just "is it a string".
type Account = {
  id: FormatUUIDv4;
  email: FormatEmail;
  ip: FormatIPv4;
  logins: FormatPositiveInt;
};

const isAccount = createValidate<Account>();
isAccount({id: 'nope', email: 'ada@x.com', ip: '10.0.0.1', logins: 3}); // false — id isn't a uuid

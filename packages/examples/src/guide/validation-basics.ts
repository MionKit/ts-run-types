import {createValidate, createGetValidationErrors} from 'ts-runtypes';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
};

// start-validate
// createValidate -> a type guard. Fast yes/no.
const isUser = createValidate<User>();

isUser({id: 1, name: 'Ada', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada', roles: ['admin']}); // false — id is not a number

// It narrows too: inside the `if`, `data` is typed.
function handle(data: unknown) {
  if (isUser(data)) data.roles; // ('admin' | 'user')[]
}
// end-validate

// start-errors
// createGetValidationErrors -> the same checks, but it tells you what broke.
const userErrors = createGetValidationErrors<User>();

userErrors({id: 1, name: 'Ada', roles: ['admin']}); // [] — all good
userErrors({id: '1', name: 42, roles: ['boss']});
// [
//   {path: ['id'], expected: 'number'},
//   {path: ['name'], expected: 'string'},
//   {path: ['roles', 0], expected: "'admin' | 'user'"},
// ]
// end-errors

export {isUser, userErrors, handle};

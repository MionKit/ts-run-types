import {createValidate} from 'ts-runtypes';

// Your TypeScript type is the single source of truth — nothing else to write.
type User = {
  id: number;
  name: string;
  email: string;
  roles: ('admin' | 'user')[];
};

// A specialized validator, generated from the type at build time.
const isUser = createValidate<User>();

isUser({id: 1, name: 'Ada', email: 'ada@example.com', roles: ['admin']}); // true
isUser({id: '1', name: 'Ada'}); // false

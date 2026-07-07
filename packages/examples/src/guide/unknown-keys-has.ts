import {createHasUnknownKeys} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createHasUnknownKeys -> true if the value carries any key the type didn't declare.
const hasExtra = createHasUnknownKeys<User>();

hasExtra({id: 1, name: 'Ada'}); // false
hasExtra({id: 1, name: 'Ada', admin: true}); // true — `admin` isn't in User

export {hasExtra};

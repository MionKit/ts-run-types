import {createUnknownKeyErrors} from '@mionjs/ts-go-run-types';

type User = {id: number; name: string};

// createUnknownKeyErrors -> one {path, expected: 'never'} entry per undeclared key.
const unknownKeyErrors = createUnknownKeyErrors<User>();

unknownKeyErrors({id: 1, name: 'Ada'}); // []
unknownKeyErrors({id: 1, name: 'Ada', admin: true});
// [{path: ['admin'], expected: 'never'}]

export {unknownKeyErrors};

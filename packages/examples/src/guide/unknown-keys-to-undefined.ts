import {createUnknownKeysToUndefined} from '@ts-runtypes/core';

type User = {id: number; name: string};

// createUnknownKeysToUndefined -> sets undeclared keys to undefined instead of deleting.
const blank = createUnknownKeysToUndefined<User>();

const value = {id: 1, name: 'Ada', admin: true};
blank(value); // {id: 1, name: 'Ada', admin: undefined} — key stays, value cleared

export {blank};

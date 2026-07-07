import {createFriendlyI18n, createGetValidationErrors} from '@ts-runtypes/core';
import type {User} from './user';
import {friendlyUser} from './friendly-user';
import {es_friendlyUser} from './i18n-es';
import {pl_friendlyUser} from './i18n-pl';

const getUserErrors = createGetValidationErrors<User>();

const friendly = createFriendlyI18n<User>(friendlyUser, {
  locale: 'pl',
  translations: {es: es_friendlyUser, pl: pl_friendlyUser},
});

const badInput: unknown = {name: 'A', age: 200};
friendly.errors(getUserErrors(badInput));
// → Polish messages, falling back to your source text wherever a blank was left

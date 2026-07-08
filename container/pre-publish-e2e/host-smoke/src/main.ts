import {createValidate, getRunTypeId} from '@ts-runtypes/core';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// The marker call shapes the plugin rewrites (CLAUDE.md marker rule): the factory
// createValidate<T>(), static getRunTypeId<T>(), AND value-first getRunTypeId(value).
// If the host-platform binary didn't resolve (via @ts-runtypes/bin's optional-dep
// model), spawn, and rewrite these, the transform would fail outright.
export const isUser = createValidate<User>();
export const userTypeIdStatic = getRunTypeId<User>();

const sampleUser: User = {id: 1, name: 'Ada', email: 'a@b.c', roles: ['admin']};
export const userTypeIdFromValue = getRunTypeId(sampleUser);

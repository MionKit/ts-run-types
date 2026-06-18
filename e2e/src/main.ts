import {createValidate, getRunTypeId} from 'ts-runtypes';

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

// Both call shapes the plugin rewrites: a factory (createValidate) and a
// reflection id (getRunTypeId). If the platform binary didn't resolve, spawn,
// and rewrite these, the build/transform would fail outright.
export const isUser = createValidate<User>();
export const userTypeId = getRunTypeId<User>();

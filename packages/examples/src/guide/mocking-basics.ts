import {createMockData, createValidate} from '@ts-runtypes/core';

type User = {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
  active: boolean;
};

// start-basics
// createMockData -> a function that invents a fresh, valid User every call.
const mockUser = createMockData<User>();

const a = mockUser(); // {id: 91, name: 'qZ...', roles: ['user'], active: true}
const b = mockUser(); // a different one each time

// Whatever it produces passes the validator for the same type — by construction.
const isUser = createValidate<User>();
isUser(mockUser()); // true
// end-basics

export {mockUser, a, b};

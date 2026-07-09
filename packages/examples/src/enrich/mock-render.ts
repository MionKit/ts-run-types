import {createMockData} from '@ts-runtypes/core';
import type {User} from './user';
import {mockUser} from './mock-user';

const newUser = createMockData<User>(undefined, {data: mockUser});

newUser();
// → { name: 'Liang Wei', age: 41, isActive: true,
//     tags: ['beta', 'vip'],
//     profile: { email: 'liang@corp.io', score: 73 } }

// Family 10 — Mocking. Mirrors guide/mocking-*.ts + custom-mocking-function.ts.
// createMockType output passes createValidate for the same T; options + formats
// are honored; a custom per-kind mock generator is registered.
import {createMockType, createValidate, registerMockingFunction, RunTypeKind, type FormatAnnotation} from '@ts-runtypes/core';
import type * as TF from '@ts-runtypes/core/formats';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
  roles: ('admin' | 'user')[];
  active: boolean;
}

interface Contact {
  id: TF.UUIDv4;
  email: TF.Email;
  name: string;
}

// Register a custom mock for string formats: emails get a fixed friendly value.
registerMockingFunction(RunTypeKind.string, (annotation: FormatAnnotation) => {
  if (annotation.name === 'email') return 'someone@example.com';
  return undefined; // defer to the built-in mock otherwise
});

export const mockUser = createMockType<User>();
export const isUser = createValidate<User>();
export const mockContact = createMockType<Contact>();

// Factory-level options (bounded numbers, always include optionals).
export const mockBounded = createMockType<User>(undefined, {mock: {minNumber: 0, maxNumber: 1000}});

export function checkMocking(): CheckResult[] {
  const generated = mockUser();
  const contact = mockContact();
  return [
    // By construction, a mock passes the validator for the same type.
    ok('mocking: generated value passes createValidate', isUser(mockUser())),
    ok('mocking: generated value has the declared keys', typeof generated.id === 'number' && Array.isArray(generated.roles)),
    ok('mocking: bounded option keeps numbers in range', mockBounded().id >= 0 && mockBounded().id <= 1000),
    ok('mocking: two calls produce independent values', mockUser() !== mockUser()),
    // The custom mock fn drove the email format to the fixed friendly value.
    ok('mocking: custom mock fn shapes the email format', contact.email === 'someone@example.com'),
  ];
}

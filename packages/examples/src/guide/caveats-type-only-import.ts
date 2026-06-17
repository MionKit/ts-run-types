import type * as TF from 'ts-runtypes/formats';
import {createValidate} from 'ts-runtypes';
// The Format* aliases are types, so `import type` reads naturally — and it's
// fine here, because the alias is used purely at the type level.

// This works: createValidate is a real value import, the format is a type.
type Contact = {email: TF.Email};
const isContact = createValidate<Contact>();

// The trap is the OTHER direction: don't `import type { createValidate }`.
// A type-only import of a function erases it at runtime — the call would be
// gone and nothing gets generated. Import the factories as VALUES.

isContact({email: 'ada@example.com'}); // true

export {isContact};
export type {Contact};

package diag

// Docs prose for the website diagnostics page, keyed by code. This is the
// single Go-side source for the human-written explanation of each
// diagnostic: a plain-language Summary of what triggers it and how to fix
// it, an optional Fix snippet (the corrected code), and an Example (the
// TypeScript source that actually triggers the code). The gen-diag-catalog
// dump exports all three, so scripts/gen-diag-catalog.mjs renders the page
// without a second prose source.
//
// Example is not just docs. The standardized suite in
// internal/resolver/diag_examples_test.go feeds every non-empty Example
// through the real scan pipeline and asserts this code fires, so an example
// can never drift from the diagnostic it demonstrates. Author an Example as
// a complete file: the `ts-runtypes` import, the type, and the marker call.
//
// Voice rules (these render on the website): plain language, no compiler
// internals, no dashes chaining clauses. Backtick spans in Summary become
// inline code; keep wider examples in Fix.
//
// Codes are filled as they are documented. A prose entry for a code that is
// not registered panics at init (so prose can never reference a code that
// does not exist); a registered code with no prose entry is fine, and the
// generator reports the remaining gaps.

type prose struct {
	Summary string
	Fix     string
	Example string
}

var proseByCode = map[string]prose{
	// ───────────────────────── validate (VL) ─────────────────────────

	CodeVLNonSerializableRoot: {
		Summary: "The type you validate is a built-in that carries runtime state, like a `WeakMap`, a `WeakSet`, or a typed array such as `Uint8Array`. None of these survive a JSON round trip, so a guard that passed for one would claim a safety it cannot deliver. Validate a plain shape, or convert the value before you validate it.",
		Fix: `const bytes = Array.from(myUint8Array);
const isData = createValidate<number[]>();`,
		Example: `import {createValidate} from 'ts-runtypes';
export const isData = createValidate<Uint8Array>();`,
	},
	CodeVLSymbolRoot: {
		Summary: "The type is a bare `symbol`. Every symbol has its own runtime identity, so it cannot round trip across a network or a process boundary. Use a stable string union instead.",
		Fix:     `type Status = 'pending' | 'active' | 'done';`,
		Example: `import {createValidate} from 'ts-runtypes';
export const isData = createValidate<symbol>();`,
	},
	CodeVLFunctionPropDropped: {
		// No Example: a function-valued property on a plain object surfaces as
		// VL011 (method drop). VL010 fires only when such a property is dropped
		// inside a DataOnly union projection, which no minimal type reaches today.
		Summary: "A function-valued property carries no data, so it is left out of the validated shape. The surrounding data properties are still checked. Drop the property, or replace it with the data it would produce.",
	},
	CodeVLMethodDropped: {
		Summary: "A function-valued member, written as a method like `greet(): string` or as a function-typed property like `onClick: () => void`, is behavior, not data, so it is left out of the validated shape. Expose the data you need as a plain property instead.",
		Example: `import {createValidate} from 'ts-runtypes';
interface User { name: string; greet(): string; }
export const isUser = createValidate<User>();`,
	},
	CodeVLStaticDropped: {
		Summary: "Static members live on the class, not on an instance. Validation works on instance shape, so statics are left out.",
		Example: `import {createValidate} from 'ts-runtypes';
class Config { static version = 1; name = ''; }
export const isConfig = createValidate<Config>();`,
	},
	CodeVLSymbolKeyedDropped: {
		// No Example: the symbol-keyed drop slot is registered but not currently
		// emitted by the compiler, so no snippet triggers it today.
		Summary: "JSON has string keys only, so a symbol-keyed property has nowhere to land in the serialized form. Use a string key if the property is real data.",
		Fix: `interface Item {
  id: string; // instead of [Symbol.for('id')]: string
}`,
	},
	CodeVLUnionMemberDropped: {
		Summary: "A union is validated as the members that have a data form. `Date | symbol` validates as `Date`. If every member has no data form the projection is `never`, and validation throws at build time instead.",
		Example: `import {createValidate} from 'ts-runtypes';
export const isData = createValidate<Date | symbol>();`,
	},
	CodeVLNonSerializablePropDrop: {
		Summary: "A property whose value is a symbol, a Promise, or a non-serializable built-in has no data form, so `{ id: symbol }` validates as `{}`. A value that is only structurally unserializable, like `symbol[]` or `Map<string, symbol>`, cannot be dropped without changing the shape, so that case throws at build time instead.",
		Example: `import {createValidate} from 'ts-runtypes';
interface Box { id: symbol; name: string; }
export const isBox = createValidate<Box>();`,
	},
	CodeVLRootAnyUnknown: {
		Summary: "`any` and `unknown` describe anything, so a structural check has nothing to compare against. The guard is always true. Narrow the type to the shape you expect.",
		Fix:     `const isUser = createValidate<User>(); // instead of <unknown>`,
		Example: `import {createValidate} from 'ts-runtypes';
export const isAnything = createValidate<unknown>();`,
	},

	// ──────────────────── validationErrors (VE) ────────────────────

	CodeVENonSerializableRoot: {
		Summary: "Same case as `VL001`, from `createGetValidationErrors`. The type is a built-in that carries runtime state and cannot survive a JSON round trip. Report errors against a plain shape, or convert the value first.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
export const errorsOf = createGetValidationErrors<Uint8Array>();`,
	},
	CodeVESymbolRoot: {
		Summary: "Same case as `VL002`, from `createGetValidationErrors`. The type is a bare `symbol`, which cannot round trip. Use a string union instead.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
export const errorsOf = createGetValidationErrors<symbol>();`,
	},
	CodeVEFunctionPropDropped: {
		// No Example, same reason as VL010: a function-valued property on a plain
		// object surfaces as VE011, not VE010.
		Summary: "Same case as `VL010`, from `createGetValidationErrors`. A function-valued property carries no data and is left out of the report.",
	},
	CodeVEMethodDropped: {
		Summary: "Same case as `VL011`, from `createGetValidationErrors`. A method or function-typed property is behavior, not data, so it is left out of the report.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
interface User { name: string; greet(): string; }
export const errorsOf = createGetValidationErrors<User>();`,
	},
	CodeVEStaticDropped: {
		Summary: "Same case as `VL012`, from `createGetValidationErrors`. Static members are not part of instance data, so they are left out.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
class Config { static version = 1; name = ''; }
export const errorsOf = createGetValidationErrors<Config>();`,
	},
	CodeVESymbolKeyedDropped: {
		// No Example, same reason as VL013: the symbol-keyed drop slot is not
		// currently emitted by the compiler.
		Summary: "Same case as `VL013`, from `createGetValidationErrors`. Symbol keys are not JSON-representable, so the property is left out.",
	},
	CodeVENonSerializablePropDrop: {
		Summary: "Same case as `VL015`, from `createGetValidationErrors`. A property whose value has no data form is left out of the report.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
interface Box { id: symbol; name: string; }
export const errorsOf = createGetValidationErrors<Box>();`,
	},
	CodeVERootAnyUnknown: {
		Summary: "Same idea as `VL021`, from `createGetValidationErrors`. On `any` or `unknown` there is nothing to compare against, so the report is always empty. Narrow the type to the shape you expect.",
		Example: `import {createGetValidationErrors} from 'ts-runtypes';
export const errorsOf = createGetValidationErrors<unknown>();`,
	},
}

// init folds the prose onto the registered Definitions. It runs after the
// codes_*.go init functions (Go runs a package's init functions in lexical
// file-name order, and "prose.go" sorts after every "codes_*.go"), so every
// Definition the prose references already exists.
func init() {
	for code, text := range proseByCode {
		definition, ok := Definitions[code]
		if !ok {
			panic("diag: prose for unregistered code " + code)
		}
		definition.Summary = text.Summary
		definition.Fix = text.Fix
		definition.Example = text.Example
		Definitions[code] = definition
	}
}

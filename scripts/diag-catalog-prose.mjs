// Hand-written, plain-language prose for the diagnostics page, keyed by code.
//
// The generated data (scripts/gen-diag-catalog.mjs) supplies the mechanical
// parts: code, severity, subsystem, and the verbatim terminal headline. This
// file supplies the part a person has to write: a short `summary` of what
// triggers the code and how to fix it, plus an optional `fix` code snippet.
//
// Rules (these render on the website, so the voice rules apply):
//   - Plain language, no compiler internals.
//   - No dashes chaining clauses. Use commas, periods, or parentheses.
//   - Backtick spans become inline <code>; keep wider examples in `fix`.
//
// Fill codes as they are documented. The generator reports which registered
// codes still have no entry here.

export const DIAG_PROSE = {
  // ───────────────────────── Validation (VL / VE) ─────────────────────────

  VL001: {
    summary:
      'The type you validate is a built-in that carries runtime state, like `Map`, `Set`, a typed array, or `Promise`. None of these survive a JSON round trip, so a guard that passed for one would claim a safety it cannot deliver. Validate a plain shape, or convert the value before you validate it.',
    fix: "const asObject = Object.fromEntries(myMap);\nconst isData = createValidate<Record<string, number>>();",
  },
  VL002: {
    summary:
      'The type is a bare `symbol`. Every symbol has its own runtime identity, so it cannot round trip across a network or a process boundary. Use a stable string union instead.',
    fix: "type Status = 'pending' | 'active' | 'done';",
  },
  VL010: {
    summary:
      'A property whose type is a function carries no data, so it is left out of the check. Given `interface User { name: string; onClick: () => void }`, the guard checks `name` only, so a value with a wrong `onClick` still passes. Drop the property, or replace it with the data it would produce.',
  },
  VL011: {
    summary:
      'Methods are behavior, not data, so they are not part of the validated shape. If you want a method result checked, expose it as a data property.',
  },
  VL012: {
    summary:
      'Static members live on the class, not on an instance. Validation works on instance shape, so statics are left out.',
  },
  VL013: {
    summary:
      'JSON has string keys only, so a symbol-keyed property has nowhere to land in the serialized form. Use a string key if the property is real data.',
    fix: "interface Item {\n  id: string; // instead of [Symbol.for('id')]: string\n}",
  },
  VL014: {
    summary:
      'A union is validated as the members that have a data form. `Date | symbol` validates as `Date`. If every member has no data form the projection is `never`, and validation throws at build time instead. `createGetValidationErrors` reports this same case as `VL014`.',
  },
  VL015: {
    summary:
      'A property whose value is a symbol, a Promise, or a non-serializable built-in has no data form, so `{ id: symbol }` validates as `{}`. A value that is only structurally unserializable, like `symbol[]` or `Map<string, symbol>`, cannot be dropped without changing the shape, so that case throws at build time instead.',
  },
  VL021: {
    summary:
      '`any` and `unknown` describe anything, so a structural check has nothing to compare against. The guard is always true. Narrow the type to the shape you expect.',
    fix: 'const isUser = createValidate<User>(); // instead of <unknown>',
  },

  VE001: {
    summary:
      'Same case as `VL001`, from `createGetValidationErrors`. The type is a built-in that carries runtime state and cannot survive a JSON round trip. Report errors against a plain shape, or convert the value first.',
  },
  VE002: {
    summary: 'Same case as `VL002`, from `createGetValidationErrors`. The type is a bare `symbol`, which cannot round trip. Use a string union instead.',
  },
  VE010: {summary: 'Same case as `VL010`, from `createGetValidationErrors`. A function-valued property carries no data and is left out of the report.'},
  VE011: {summary: 'Same case as `VL011`, from `createGetValidationErrors`. Methods are behavior, not data, so they are left out.'},
  VE012: {summary: 'Same case as `VL012`, from `createGetValidationErrors`. Static members are not part of instance data, so they are left out.'},
  VE013: {summary: 'Same case as `VL013`, from `createGetValidationErrors`. Symbol keys are not JSON-representable, so the property is left out.'},
  VE015: {summary: 'Same case as `VL015`, from `createGetValidationErrors`. A property whose value has no data form is left out of the report.'},
  VE020: {
    summary:
      'Same idea as `VL021`, from `createGetValidationErrors`. On `any` or `unknown` there is nothing to compare against, so the report is always empty. Narrow the type to the shape you expect.',
  },
};

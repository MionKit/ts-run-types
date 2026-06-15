// Unified diagnostic catalog. Single source of truth for every user-facing
// wording — both build-time diagnostics and runtime alwaysThrow messages.
// The Go binary ships only the Code (+ positional Args); this file resolves
// to rendered text at format time. See docs/UNSUPPORTED-KINDS.md.
//
// Wording standard (CLAUDE.md): use TS vocabulary; state user-visible
// consequence; end with the fix as concrete code; single-line headline first,
// optional detail block after. `{0}`, `{1}` resolve against the `args` array.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** Optional multi-line detail block (explanation + code-example fix). */
  readonly detail?: string;
}

// Shared per-kind body fragments — referenced by per-family entries so the
// explanation is identical across PJ001 / SJ001 / TB001 / etc.
const NEVER_DETAIL = `\`never\` is the empty type — no value can ever inhabit it. A field
typed \`never\` cannot carry a runtime value, so there is nothing to
encode/decode/validate.

Fix — use \`unknown\` if you really want to accept any value:
  interface User {
-   tag: never;
+   tag: unknown;  // narrow before use
  }

Fix — pick a concrete type matching your real data:
  interface User {
-   tag: never;
+   tag: 'pending' | 'active' | 'done';
  }`;

const NON_SERIALIZABLE_DETAIL = `Built-in classes like \`Map\`, \`Set\`, \`WeakMap\`, \`WeakSet\`, \`Int8Array\`,
\`Uint8Array\`, \`Buffer\`, and \`Promise\` carry runtime state that doesn't
survive a JSON or binary round-trip. Their instance identity is lost the
moment they're serialised.

Fix — convert to a plain object/array before serialising:
  // for Map<K, V>:
  const data = Object.fromEntries(yourMap);
  // for Set<T>:
  const data = [...yourSet];
  // for typed arrays:
  const data = Array.from(yourBuffer);

Fix — change the field type to a serialisable shape:
  interface User {
-   tags: Set<string>;
+   tags: string[];
  }`;

const FUNCTION_ROOT_DETAIL = `Functions have no value form to serialise — their closure, prototype,
and bound state aren't representable in JSON or binary.

Fix — drop the function from your type, or replace it with the data the
function would produce:
  interface User {
-   getName: () => string;
+   name: string;
  }`;

const ARRAY_ELEMENT_DETAIL = `Arrays of un-serialisable elements (\`symbol[]\`, \`(() => void)[]\`,
\`Map<K, V>[]\`, etc.) can't be encoded — every element would need to be
representable, and these aren't. Dropping individual elements would
change the array length, so the encoder refuses rather than silently
shipping a different shape.

Fix — change the element type to something serialisable:
  -  type Items = (() => void)[];
+  type Items = string[];`;

const SYMBOL_DETAIL = `Every \`symbol\` value carries a unique runtime identity (\`Symbol() !==
Symbol()\` even with the same description). That identity disappears the
moment it's serialised, and two symbols can't be compared across realms,
workers, or process boundaries. A validator that asserts "this is a
symbol" gives a false sense of safety — the value can't actually
round-trip.

Fix — use a stable string key (often a literal union):
  -  type Status = symbol;
+  type Status = 'pending' | 'active' | 'done';`;

// Headline: `Cannot <verb> <kind label> <suffix>.`. Kind label comes from
// the Go-side leafKindLabel and is passed via args[0].
function rootThrow(verb: string, detail: string, suffix = ''): DiagnosticEntry {
  return {
    headline: `Cannot ${verb} \`{0}\`${suffix ? ' ' + suffix : ''}.`,
    detail,
  };
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
  // ────────────────────── Marker family (MKR) ──────────────────────

  MKR001: {
    headline:
      '`{0}()` is being called at runtime just so the marker can read its return type — side effects, throws, or async work run for nothing.',
    detail: `Reflect-form markers (\`createValidate(value)\`, \`getRunTypeId(value)\`)
invoke their argument expression at runtime; the value is then discarded —
only its inferred type is used.

Fix — use the static form with \`ReturnType<>\`:
  -  const isUser = createValidate({0}());
+  const isUser = createValidate<ReturnType<typeof {0}>>();

Fix — pass an existing value of the desired type:
  const existingUser: User = ...;
  const isUser = getRunTypeId(existingUser);`,
  },

  CTA001: {
    headline:
      '`CompTimeArgs<T>` argument must be a literal at the call site, or a module-scope `const` whose initializer is itself entirely literal.',
    detail: `The build resolves the argument before running, so it needs to read its
value from the source. Identifiers from other modules, function-call
results, property accesses, and \`let\`/\`var\` bindings can't be
evaluated at build time. Only inline literals and module-scope \`const\`
bindings whose initializer is itself fully literal are accepted.

Fix — inline at the call site:
-  const opts = getOpts();
-  const isUser = createValidate<User>(undefined, opts);
+  const isUser = createValidate<User>(undefined, {mode: 'unsafe'});

Fix — use a module-scope const of literals:
  const opts = {mode: 'unsafe'};            // literal initializer ✓
  const isUser = createValidate<User>(undefined, opts);`,
  },

  CTA002: {
    headline: '`CompTimeArgs<T>` literal nesting exceeds the depth cap (16) — refactor to flatten.',
    detail: `Deeply nested literal walks are capped at 16 levels to keep the build
predictable. If you hit this, the value is almost certainly not what
you want at compile time — split it across multiple smaller
\`CompTimeArgs<T>\` arguments, or flatten the nesting.`,
  },

  CTA003: {
    headline: '`CompTimeArgs<T>` literal contains a forbidden construct ({0}). Only literals and nested literals are allowed.',
    detail: `The Go scanner cannot statically evaluate spread elements, computed
property names, function calls, ternary expressions, or template-string
substitutions. Inside a \`CompTimeArgs<T>\` literal every node must be a
direct literal (string / number / bigint / boolean / null / undefined /
regex / arrow / object literal / array literal) or a const-traced
identifier that resolves to one.

Fix — replace the forbidden construct with its literal value:
  -  const a = {...defaults, mode: 'unsafe'};   // spread
  +  const a = {strict: true, mode: 'unsafe'};   // literal-only`,
  },

  PFN001: {
    headline:
      '`PureFunction<F>` argument must be an inline arrow or function expression (or a module-scope `const` initialized to one).',
    detail: `The build inlines / AOT-compiles the function body, so it needs to see
the literal definition at the call site. Imported functions, function
calls that return a function, and \`let\` / \`var\` bindings can't be
followed.

Fix — inline the function at the call site:
-  import {validate} from './validators';
-  registerValidator(validate);
+  registerValidator((v) => typeof v === 'string');

Fix — use a module-scope const initialized to a function literal:
  const validate = (v: unknown) => typeof v === 'string';
  registerValidator(validate);`,
  },

  MKR003: {
    headline:
      'Marker call is inside a generic function — the type argument is unresolved, so no id can be computed at build time.',
    detail: `The build can only compute an id for a concrete type (\`User\`,
\`{name: string}\`, etc.). A type parameter like \`T\` is abstract — it
takes a different value at each call site of the surrounding function,
so a single id can't represent it.

Fix — inline the marker at each concrete call site:
  function isUser(value: unknown) {
    return createValidate<User>()(value);
  }

Fix — accept a pre-computed id from the caller:
  function makeChecker<T>(id: InjectRunTypeId<T>) {
    return createValidate<T>(id);
  }
  const isUser = makeChecker<User>(getRunTypeId<User>());`,
  },

  // ─────────── Temporal family (TMPxxx) ───────────
  TMP001: {
    headline:
      "Temporal type `{0}` resolved to `any` — the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    detail: `ts-go-run-types reads types through TypeScript's lib definitions, so it
can only validate \`Temporal.*\` types when the Temporal namespace is loaded.
With the lib missing, \`{0}\` silently degrades to \`any\` and the validator
becomes a no-op that accepts everything — almost never what you intended.

Fix — add "ESNext.Temporal" to your tsconfig:
  {
    "compilerOptions": {
      "lib": ["ES2023", "ESNext.Temporal"]
    }
  }`,
  },

  // ─────────── Pure-fn family (PFE9xxx) — registerPureFnFactory ───────────
  // PFE9001–PFE9003 retired with the marker migration; shape diagnostics
  // now flow through CTA001 / PFN001.

  PFE9004: {
    headline: 'Duplicate `registerPureFnFactory` for `{0}` with a different body — only one definition can win.',
    detail: `Two calls register the same \`namespace::functionId\` key but the factory
bodies differ. The cache can only hold one definition, so one call site
silently loses its version at runtime.

Fix — make all registrations identical, or pick one canonical site and
delete the others. The Related: line above points at the first
registration the extractor saw.`,
  },

  PFE9005: {
    headline: 'Pure-fn factory `{0}` uses destructured parameters — only simple identifier params are supported.',
    detail: `The build inlines parameter references by name when it materialises the
factory. Destructuring patterns (\`({a, b})\`, \`([x, y])\`) don't have a
single name to substitute.

Fix — destructure inside the body:
  -  registerPureFnFactory('ns', 'fn', (utl) => ({a, b}) => ...);
+  registerPureFnFactory('ns', 'fn', (utl) => (params) => {
+    const {a, b} = params;
+    return ...;
+  });`,
  },

  PFE9006: {
    headline:
      "`this` is not allowed inside a `registerPureFnFactory` factory body — pure functions can't depend on a calling context.",
    detail: `Pure functions are materialised standalone at build time; there's no
\`this\` to bind to.

Fix — replace \`this\` with an explicit parameter, or move the function
out of the class/object method that owns the \`this\`:
  registerPureFnFactory('ns', 'fn', (utl) => (self, input) => {
    return self.field + input;
  });`,
  },

  PFE9007: {
    headline: '`async`/`await` is not allowed inside a `registerPureFnFactory` factory body.',
    detail: `Pure functions must run synchronously so the build can call them at
compile time. \`async\` introduces a Promise that won't resolve until
runtime.

Fix — make the factory synchronous; move async work to the caller:
  registerPureFnFactory('ns', 'fn', (utl) => {
-   return async (input) => { const r = await heavy(); return r; };
+   return (resolvedValue) => transform(resolvedValue);
  });`,
  },

  PFE9008: {
    headline: '`yield` / generators are not allowed inside a `registerPureFnFactory` factory body.',
    detail: `Generators carry resumption state that can't be materialised
statically.

Fix — return an array or a plain iterable instead:
  registerPureFnFactory('ns', 'fn', (utl) => (input) => {
    return [...computeAll(input)];
  });`,
  },

  PFE9009: {
    headline: '`import()` is not allowed inside a `registerPureFnFactory` factory body.',
    detail: `Dynamic imports load modules at runtime — the build needs every
dependency available statically.

Fix — use a top-level \`import\` statement, or pass the imported module
in as a parameter.`,
  },

  PFE9010: {
    headline: '`{0}` is not allowed inside a `registerPureFnFactory` factory body.',
    detail: `Globals like \`eval\`, \`Function\`, \`fetch\`, \`XMLHttpRequest\`, \`require\`,
\`process\`, \`globalThis\`, \`window\`, \`document\` are blocked from pure-fn
bodies — they either execute arbitrary code or depend on a runtime
environment the build can't reproduce.

Fix — remove the reference, or pass the needed value in as a parameter.`,
  },

  PFE9011: {
    headline:
      "`{0}` is captured from outer scope inside a `registerPureFnFactory` factory — pure functions can't reach outside their own body.",
    detail: `The build inlines factory bodies without their lexical environment, so
any free variable becomes \`undefined\` at runtime.

Fix — pass \`{0}\` in as a parameter:
  registerPureFnFactory('ns', 'fn', (utl) => ({0}, value) => ...);

Fix — inline its value if it's a known constant:
  registerPureFnFactory('ns', 'fn', (utl) => (value) => {
    const {0} = 42;
    ...
  });

Fix — import \`{0}\` directly inside the factory if it's a module export.`,
  },

  PFE9012: {
    headline:
      'Pure-fn `{0}` is referenced by a RT function but never registered — call `registerPureFnFactory({1}, {2}, …)` first.',
    detail: `A RT validator/encoder calls \`utl.usePureFn('{0}')\` (or similar) but
no \`registerPureFnFactory\` call with that namespace+function pair was
found in any scanned source file.

Fix — register the function in the expected location ({3}, if known).
Make sure the file is included in the scan set.`,
  },

  PFE9013: {
    headline: '`{0}.{1}` dependency argument must be a string literal or a same-scope `const` string.',
    detail: `\`utl.usePureFn\` / \`utl.getPureFn\` need a static key so the build can
verify the referenced pure-fn is registered.

Fix:
  -  const key = buildKey();
-  return utl.usePureFn(key)(input);
+  return utl.usePureFn('mion::myFn')(input);`,
  },

  // ──────────── RunType family (root throws and child drops) ────────────
  // Per-family entries share explanation bodies via the *_DETAIL constants.

  // prepareForJson (PJ)
  PJ001: rootThrow('encode', NEVER_DETAIL, 'to JSON'),
  PJ002: rootThrow('encode', NON_SERIALIZABLE_DETAIL, 'to JSON'),
  PJ003: rootThrow('encode', FUNCTION_ROOT_DETAIL, 'to JSON'),
  PJ004: rootThrow('encode', ARRAY_ELEMENT_DETAIL, 'to JSON'),
  PJ005: rootThrow('encode', SYMBOL_DETAIL, 'to JSON'),

  // prepareForJsonSafe (PJS)
  PJS001: rootThrow('encode', NEVER_DETAIL, 'to JSON'),
  PJS002: rootThrow('encode', NON_SERIALIZABLE_DETAIL, 'to JSON'),
  PJS003: rootThrow('encode', FUNCTION_ROOT_DETAIL, 'to JSON'),
  PJS004: rootThrow('encode', ARRAY_ELEMENT_DETAIL, 'to JSON'),
  PJS005: rootThrow('encode', SYMBOL_DETAIL, 'to JSON'),

  // restoreFromJson (RJ)
  RJ001: rootThrow('decode', NEVER_DETAIL, 'from JSON'),
  RJ002: rootThrow('decode', NON_SERIALIZABLE_DETAIL, 'from JSON'),
  RJ003: rootThrow('decode', FUNCTION_ROOT_DETAIL, 'from JSON'),
  RJ004: rootThrow('decode', ARRAY_ELEMENT_DETAIL, 'from JSON'),
  RJ005: rootThrow('decode', SYMBOL_DETAIL, 'from JSON'),

  // stringifyJson (SJ)
  SJ001: rootThrow('stringify', NEVER_DETAIL, 'to a JSON string'),
  SJ002: rootThrow('stringify', NON_SERIALIZABLE_DETAIL, 'to a JSON string'),
  SJ003: rootThrow('stringify', FUNCTION_ROOT_DETAIL, 'to a JSON string'),
  SJ004: rootThrow('stringify', ARRAY_ELEMENT_DETAIL, 'to a JSON string'),
  SJ005: rootThrow('stringify', SYMBOL_DETAIL, 'to a JSON string'),

  // toBinary (TB)
  TB001: rootThrow('serialise', NEVER_DETAIL, 'to binary'),
  TB002: rootThrow('serialise', NON_SERIALIZABLE_DETAIL, 'to binary'),
  TB003: rootThrow('serialise', FUNCTION_ROOT_DETAIL, 'to binary'),
  TB004: rootThrow('serialise', ARRAY_ELEMENT_DETAIL, 'to binary'),
  TB005: rootThrow('serialise', NON_SERIALIZABLE_DETAIL, 'to binary'),
  TB006: rootThrow('serialise', SYMBOL_DETAIL, 'to binary'),

  // fromBinary (FB)
  FB001: rootThrow('deserialise', NEVER_DETAIL, 'from binary'),
  FB002: rootThrow('deserialise', NON_SERIALIZABLE_DETAIL, 'from binary'),
  FB003: rootThrow('deserialise', FUNCTION_ROOT_DETAIL, 'from binary'),
  FB004: rootThrow('deserialise', ARRAY_ELEMENT_DETAIL, 'from binary'),
  FB005: rootThrow('deserialise', NON_SERIALIZABLE_DETAIL, 'from binary'),
  FB006: rootThrow('deserialise', SYMBOL_DETAIL, 'from binary'),

  // validate (IT) — root throws
  VL001: rootThrow('validate', NON_SERIALIZABLE_DETAIL),
  VL002: rootThrow('validate', SYMBOL_DETAIL),

  // validationErrors (TE) — root throws
  VE001: rootThrow('validate', NON_SERIALIZABLE_DETAIL),
  VE002: rootThrow('validate', SYMBOL_DETAIL),

  // ────────────── Child-position member drops (Warning) ──────────────
  // These don't throw — they silently exclude one member from the output.
  // See CLAUDE.md "validate contract" for the design rationale.

  // Function-typed property dropped (one entry per family, same shape)
  VL010: dropFunctionProp('validate', 'validated'),
  VE010: dropFunctionProp('validationErrors', 'checked'),
  PJ010: dropFunctionProp('prepareForJson', 'encoded'),
  PJS010: dropFunctionProp('prepareForJsonSafe', 'encoded'),
  RJ010: dropFunctionProp('restoreFromJson', 'decoded'),
  SJ010: dropFunctionProp('stringifyJson', 'stringified'),
  TB010: dropFunctionProp('toBinary', 'serialised'),
  FB010: dropFunctionProp('fromBinary', 'deserialised'),
  HUK010: dropFunctionProp('hasUnknownKeys', 'checked'),
  SUK010: dropFunctionProp('stripUnknownKeys', 'stripped'),
  UKE010: dropFunctionProp('unknownKeyErrors', 'checked'),
  UKU010: dropFunctionProp('unknownKeysToUndefined', 'cleared'),
  UKW010: dropFunctionProp('unknownKeysToUndefinedWire', 'cleared'),

  // Method dropped
  VL011: dropMethod('validate', 'validated'),
  VE011: dropMethod('validationErrors', 'checked'),
  PJ011: dropMethod('prepareForJson', 'encoded'),
  PJS011: dropMethod('prepareForJsonSafe', 'encoded'),
  RJ011: dropMethod('restoreFromJson', 'decoded'),
  SJ011: dropMethod('stringifyJson', 'stringified'),
  TB011: dropMethod('toBinary', 'serialised'),
  FB011: dropMethod('fromBinary', 'deserialised'),

  // Static member dropped
  VL012: dropStatic('validate', 'validated'),
  VE012: dropStatic('validationErrors', 'checked'),
  PJ012: dropStatic('prepareForJson', 'encoded'),
  PJS012: dropStatic('prepareForJsonSafe', 'encoded'),
  RJ012: dropStatic('restoreFromJson', 'decoded'),
  SJ012: dropStatic('stringifyJson', 'stringified'),
  TB012: dropStatic('toBinary', 'serialised'),
  FB012: dropStatic('fromBinary', 'deserialised'),

  // Symbol-keyed property dropped
  VL013: dropSymbolKeyed('validate', 'validated'),
  VE013: dropSymbolKeyed('validationErrors', 'checked'),
  PJ013: dropSymbolKeyed('prepareForJson', 'encoded'),
  PJS013: dropSymbolKeyed('prepareForJsonSafe', 'encoded'),
  RJ013: dropSymbolKeyed('restoreFromJson', 'decoded'),
  SJ013: dropSymbolKeyed('stringifyJson', 'stringified'),
  TB013: dropSymbolKeyed('toBinary', 'serialised'),
  FB013: dropSymbolKeyed('fromBinary', 'deserialised'),

  // Root any/unknown — noop validator (Warning)
  VL021: {
    headline: '`validate` on `any` / `unknown` always returns true — the validator accepts every value.',
    detail: `\`any\` and \`unknown\` describe "anything", so a structural validator has
nothing to check. The resulting function passes for every input —
including the ones you probably wanted to reject.

Fix — narrow the type to the actual shape you expect:
  -  const isUser = createValidate<unknown>();
+  const isUser = createValidate<User>();`,
  },

  VE020: {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array — nothing is checked.',
    detail: `Same reason as VL021: \`any\` and \`unknown\` describe "anything", so the
checker has no structure to compare against. The returned error array
will always be empty.

Fix — narrow the type to the actual shape you expect:
  -  const errors = createGetValidationErrors<unknown>()(value);
+  const errors = createGetValidationErrors<User>()(value);`,
  },

  // ─────────── Class-serializer family (CLS) — advisory (Warning) ───────────
  // Emitted once per named plain user class reached by a serialization
  // family when no custom serializer is registered. Not a failure — the
  // structural fallback round-trips data correctly; this just surfaces the
  // opt-in for full instance reconstruction. args[0] = class name.
  CLS001: {
    headline:
      "class `{0}` is serialized structurally; register a serializer via `registerClassSerializer('{0}', …)` for custom (de)serialization.",
    detail: `By default a user class is serialized by its declared properties and
decoded back to a prototype-less plain object — \`instanceof {0}\` is
false on the decoded value, and any class methods / getters are gone.
This is fine when you only care about the data.

To round-trip a real \`{0}\` instance, register a custom (de)serializer:
  import {registerClassSerializer} from '@mionjs/ts-go-run-types';

  registerClassSerializer('{0}', {
    serialize: (instance) => ({ /* JSON-ready data */ }),
    deserialize: (data) => new {0}(/* rebuild from data */),
  });

\`serialize\` returns JSON-ready data (the pipeline stringifies / encodes
it); \`deserialize\` receives the parsed value and returns the instance.
The same registration is used by the JSON and binary families. \`validate\`
/ \`getValidationErrors\` are unaffected — they always validate structurally.`,
  },

  // Format mockSample contradicts its own pattern (Error)
  FMT001: {
    headline: 'Format mockSample `{0}` does not match its pattern `{1}` — mocking would produce an invalid value.',
    detail: `Every regex-based format ships \`mockSamples\` so the mock generator has
canonical valid values to draw from (a regex can't be reversed into a
value). A sample that fails its own pattern means \`createMockType\`
would emit data the matching validator rejects.

Fix — correct the sample so it satisfies the pattern, or fix the
pattern if the sample is the intended shape.`,
  },
};

function dropFunctionProp(family: string, verb: string): DiagnosticEntry {
  return {
    headline: `Property \`{0}\` is a function — \`${family}\` does not handle function values, so this property is silently not ${verb}.`,
    detail: `\`${family}\` works on JSON-shaped data; functions don't survive JSON, so
the emitter drops them. The rest of the object's behaviour is unaffected.

This is by design — see the "validate contract — serializable data only"
section in CLAUDE.md. If you need a stricter checker that fails on
missing/extra function-typed members, watch the project roadmap.`,
  };
}

function dropMethod(family: string, verb: string): DiagnosticEntry {
  return {
    headline: `Method \`{0}\` is silently not ${verb} by \`${family}\` — methods aren't data.`,
    detail: `Class and object methods aren't part of the serialisable shape, so
\`${family}\` excludes them. The rest of the type still works.

If you wanted the method's return value validated/serialised, expose it
as a data property instead.`,
  };
}

function dropStatic(family: string, verb: string): DiagnosticEntry {
  return {
    headline: `Static member \`{0}\` is silently not ${verb} by \`${family}\` — statics aren't part of instance data.`,
    detail: `Class static members live on the class, not on individual instances.
\`${family}\` operates on instance shape, so statics are excluded.`,
  };
}

function dropSymbolKeyed(family: string, verb: string): DiagnosticEntry {
  return {
    headline: `Symbol-keyed property \`{0}\` is silently not ${verb} by \`${family}\` — symbol keys aren't JSON-representable.`,
    detail: `JSON only supports string keys; symbol-keyed properties are dropped
from the serialised form. \`${family}\` follows the same rule.

Fix — use a string key:
  -  [Symbol.for('id')]: string;
+  id: string;`,
  };
}

// ─────────────────────── Rendering helpers ───────────────────────

/** Resolve `{0}`, `{1}`, … placeholders against the args array. */
function substitute(template: string, args: readonly string[] | undefined): string {
  if (!args || args.length === 0) return template;
  return template.replace(/\{(\d+)\}/g, (_match, idx) => {
    const i = Number(idx);
    return i < args.length ? args[i] : '';
  });
}

/**
 * Render the single-line headline for a code+args pair. Returns a generic
 * fallback when the code is unknown so out-of-band codes still produce a
 * useful line.
 */
export function renderHeadline(code: string, args?: readonly string[]): string {
  const entry = DIAGNOSTIC_CATALOG[code];
  if (!entry) return `Unrecognised diagnostic code (${code}) — please file an issue.`;
  return substitute(entry.headline, args);
}

/** Render the multi-line detail block, or undefined when the entry has none. */
export function renderDetail(code: string, args?: readonly string[]): string | undefined {
  const entry = DIAGNOSTIC_CATALOG[code];
  if (!entry || !entry.detail) return undefined;
  return substitute(entry.detail, args);
}

// ─────────────────── Runtime alwaysThrow factory ───────────────────

/**
 * Build a throwing-factory for an alwaysThrow cache entry. Throws
 * `[code] headline (at file:line:col)` (suffix omitted when no provenance).
 * `args` are positional substitution values for the catalog template.
 * See docs/UNSUPPORTED-KINDS.md.
 */
export function alwaysThrowFactory(code: string, siteHint?: string, ...args: string[]): () => never {
  const headline = renderHeadline(code, args);
  const base = `[${code}] ${headline}`;
  const message = siteHint ? `${base} (at ${siteHint})` : base;
  return () => {
    throw new Error(message);
  };
}

/** @deprecated Use renderHeadline (or renderDetail). */
export function messageForCode(code: string, args?: readonly string[]): string {
  return renderHeadline(code, args);
}

// GENERATED FILE — DO NOT EDIT. Run `pnpm run gen:diag-catalog` to refresh.
//
// The message dictionary for every diagnostic code the Go binary can emit,
// exported from the authoritative catalog in internal/diag (wording lives in
// internal/diag/messages.go). The wire carries only code + args; the render
// helpers in ./diagnosticCatalog.ts substitute `{0}`, `{1}`, … placeholders
// against the args array to produce the final text.

export interface DiagnosticEntry {
  /** Single-line headline. Mandatory. */
  readonly headline: string;
  /** Optional multi-line detail block (explanation + code-example fix). */
  readonly detail?: string;
}

export const DIAGNOSTIC_CATALOG: Record<string, DiagnosticEntry> = {
  CLS001: {
    headline:
      "class `{0}` is serialized structurally; register a serializer via `registerClassSerializer('{0}', …)` for custom (de)serialization.",
    detail:
      "By default a user class is serialized by its declared properties and\ndecoded back to a prototype-less plain object — `instanceof {0}` is\nfalse on the decoded value, and any class methods / getters are gone.\nThis is fine when you only care about the data.\n\nTo round-trip a real `{0}` instance, register a custom (de)serializer:\n  import {registerClassSerializer} from 'ts-runtypes';\n\n  registerClassSerializer('{0}', {\n    serialize: (instance) => ({ /* JSON-ready data */ }),\n    deserialize: (data) => new {0}(/* rebuild from data */),\n  });\n\n`serialize` returns JSON-ready data (the pipeline stringifies / encodes\nit); `deserialize` receives the parsed value and returns the instance.\nThe same registration is used by the JSON and binary families. `validate`\n/ `getValidationErrors` are unaffected — they always validate structurally.",
  },
  CTA001: {
    headline:
      '`CompTimeArgs<T>` argument must be a literal at the call site, or a `const` whose initializer is itself entirely literal (a same-module or imported `const` both work).',
    detail:
      "The build resolves the argument before running, so it needs to read its\nvalue from the source. Function-call results, property accesses, ternary\nexpressions, and `let`/`var` bindings can't be evaluated at build time.\nAccepted: an inline literal, or a `const` whose initializer is itself\nfully literal — including a `const` imported from another module. (An\nobject `const` must be `as const` so its members stay literal; see CTA004.)\n\nFix — inline at the call site:\n-  const opts = getOpts();\n-  const isUser = createValidate<User>(undefined, opts);\n+  const isUser = createValidate<User>(undefined, {mode: 'unsafe'});\n\nFix — use a const of literals (here or in another module):\n  const opts = {mode: 'unsafe'} as const;   // literal initializer ✓\n  const isUser = createValidate<User>(undefined, opts);",
  },
  CTA002: {
    headline: '`CompTimeArgs<T>` literal nesting exceeds the depth cap (16) — refactor to flatten.',
    detail:
      'Deeply nested literal walks are capped at 16 levels to keep the build\npredictable. If you hit this, the value is almost certainly not what\nyou want at compile time — split it across multiple smaller\n`CompTimeArgs<T>` arguments, or flatten the nesting.',
  },
  CTA003: {
    headline: '`CompTimeArgs<T>` literal contains a forbidden construct ({0}). Only literals and nested literals are allowed.',
    detail:
      "The Go scanner cannot statically evaluate computed property names,\nfunction calls, ternary expressions, or template-string substitutions.\nInside a `CompTimeArgs<T>` literal every node must be a direct literal\n(string / number / bigint / boolean / null / undefined / regex / arrow /\nobject literal / array literal) or a const-traced identifier that\nresolves to one.\n\nSpread IS allowed when its operand resolves to a literal container of the\nmatching kind — a `const`-bound (or imported) object literal for an\nobject spread, an array literal for an array spread:\n  const base = {strict: true};\n  const a = {...base, mode: 'unsafe'};        // ok — merges a const fragment\n\nA spread is still rejected when the operand can't be statically merged —\na dynamic value, or a shape mismatch:\n  -  const a = {...getDefaults(), mode: 'unsafe'};   // dynamic operand\n  -  const a = {...[1, 2], mode: 'unsafe'};          // object spread of an array",
  },
  CTA004: {
    headline:
      '`CompTimeArgs<T>` value comes from a `const` with a widened (non-literal) member ({0}) — declare the const `as const`.',
    detail:
      "A `const` used as a CompTimeArgs / CompTimeFnArgs argument (a whole option\nbag, or a builder child) must carry LITERAL value types, so the value the\nbuild reads matches the type TypeScript resolves the call against. Without\n`as const`, an object literal's members widen — `{strategy: 'mutate'}`\nbecomes `{strategy: string}` — which can let the type system select one\nfunction variant while the build injects another.\n\nWhole imported consts now resolve cross-module (like a spread fragment), so\nthis rule keeps that path sound.\n\nFix — add `as const`:\n-  const preset = {strategy: 'mutate'};\n+  const preset = {strategy: 'mutate'} as const;\n   createJsonEncoder(undefined, preset);",
  },
  FB001: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  FB002: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  FB003: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  FB004: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  FB005: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  FB006: {
    headline: 'Cannot deserialise `{0}` from binary.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  FB010: {
    headline:
      'Property `{0}` is a function — `fromBinary` does not handle function values, so this property is silently not deserialised.',
    detail:
      '`fromBinary` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  FB011: {
    headline: "Method `{0}` is silently not deserialised by `fromBinary` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`fromBinary` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  FB012: {
    headline: "Static member `{0}` is silently not deserialised by `fromBinary` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`fromBinary` operates on instance shape, so statics are excluded.',
  },
  FB013: {
    headline: "Symbol-keyed property `{0}` is silently not deserialised by `fromBinary` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `fromBinary` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  FB014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `fromBinary` drops them, so the union is deserialised as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `fromBinary` deserialised only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `fromBinary` throws at build time instead.',
  },
  FB015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `fromBinary` drops it, so this property is silently not deserialised.',
    detail:
      '`fromBinary` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `fromBinary` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  FMT001: {
    headline: 'TypeFormat mockSample "{0}" does not match its pattern /{1}/ — fix the sample or the pattern.',
  },
  FMT002: {
    headline: 'Invalid type-format params — {0}',
  },
  FT002: {
    headline: 'Unknown field `{0}` — the type does not declare it, so this FriendlyText entry is dead.',
    detail:
      "The FriendlyText map names a field the source type does not have\n(removed, renamed, or a typo). Its labels and messages can never be\nused.\n\nExample — `nick` no longer exists on the type:\n  interface User { name: string }\n  export const friendlyUser: FriendlyText<User> = {\n    name: {rt$label: 'Name'},\n-   nick: {rt$label: 'Nickname'},\n  };\n\nFix — remove the entry, or re-run the reconcile so the mirror follows\nthe type (a renamed field carries its authored values along):\n  ts-runtypes gen <source.ts> <Type> --update",
  },
  FT003: {
    headline: 'Error key `{0}` is not a declared constraint of this field — the message can never fire.',
    detail:
      "`rt$errors` keys must name a failure the field can actually produce:\n`type`, `rt$default`, or one of the field's declared format constraints\n(`minLength`, `pattern`, `min`, …). An undeclared key is dead\nconfiguration.\n\nExample — the field has no `maxLength` constraint:\n  interface User { name: string & FormatString<{minLength: 2}> }\n  export const friendlyUser: FriendlyText<User> = {\n    name: {\n      rt$errors: {\n        minLength: 'Name needs at least 2 characters',\n-       maxLength: 'Name is too long',\n      },\n    },\n  };\n\nFix — remove the key, or declare the matching constraint on the field's\nTypeFormat so the message has a failure to describe.",
  },
  FT005: {
    headline: 'Unknown placeholder `$[{0}]` — expected one of `$[label]`, `$[val]`, `$[path]`, `$[index]`.',
    detail:
      "Error-message templates substitute a fixed placeholder set; an unknown\nname renders literally instead of substituting.\n\nExample:\n- rt$errors: {minLength: '$[name] is too short'}\n+ rt$errors: {minLength: '$[label] is too short'}\n\nFix — use one of the recognised placeholders, or write the literal text\nwithout the `$[…]` wrapper.",
  },
  FT006: {
    headline: 'Plural error template is missing the mandatory `other` arm — the render has no backstop.',
    detail:
      "Plural templates render the CLDR arm matching the count, and `other` is\nthe arm every locale falls back to. Without it some counts have no\nmessage at all.\n\nExample:\n  rt$errors: {\n    minLength: {\n      one: 'Needs one more character',\n+     other: 'Needs $[val] more characters',\n    },\n  }\n\nFix — add the `other` arm to the plural object.",
  },
  FT007: {
    headline: 'Unknown plural arm `{0}` — CLDR categories are `zero`, `one`, `two`, `few`, `many`, `other`.',
    detail:
      "Plural template keys must be CLDR plural categories; anything else can\nnever be selected by any locale's plural rules.\n\nExample:\n  rt$errors: {\n    minLength: {\n-     single: 'Needs one more character',\n+     one: 'Needs one more character',\n      other: 'Needs $[val] more characters',\n    },\n  }\n\nFix — rename the arm to one of the six categories, or remove it.",
  },
  FT008: {
    headline: 'Constraint `{0}` carries no count — a plural template here has dead arms; use a plain string.',
    detail:
      "Only count-bearing constraints (`minLength`, `maxLength`, `min`, `max`,\n…) can select a plural arm. On a non-count constraint only `other` ever\nrenders, so the remaining arms are dead configuration.\n\nExample — `pattern` has no count:\n  rt$errors: {\n-   pattern: {one: 'One bad character', other: 'Invalid characters'},\n+   pattern: 'Only letters and numbers are allowed',\n  }\n\nFix — replace the plural object with a plain string message.",
  },
  FT009: {
    headline: '`rt$default` is mutually exclusive with per-constraint messages — use one mode or the other.',
    detail:
      "An `rt$errors` record is either ONE `rt$default` catch-all or a set of\nper-constraint keys, mirroring the TypeScript union. Mixing them makes\nthe intent ambiguous (which message wins?).\n\nExample:\n  rt$errors: {\n-   rt$default: 'Invalid name',\n    minLength: 'Name is too short',\n  }\n\nFix — keep `{rt$default: '…'}` alone, or keep the per-constraint keys\nand drop `rt$default`.",
  },
  FT011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix — the type cannot be enriched.',
    detail:
      '`rt$`-prefixed keys are reserved for enrichment meta (`rt$label`,\n`rt$errors`, `rt$items`, …); a source property with that prefix is\nindistinguishable from node meta, so gen refuses the type and the\nFriendlyType checker reports it here.\n\nFix — rename the property (a plain `$` prefix is fine; only `rt$` is\nreserved):\n  interface Config {\n-   rt$mode: string;\n+   $mode: string;\n  }',
  },
  FT020: {
    headline: 'Unfilled `@todo` placeholder — fill in the real labels/messages, then delete the `@todo` line.',
    detail:
      "The generator stamps a `@todo` line on every freshly-scaffolded const in\na FriendlyText mirror file. It means \"this skeleton still carries\ngenerated blanks\". A clean, committed mirror has none.\n\nExample — a fresh scaffold:\n  /** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */\n- // @todo: generated skeleton — fill in real data, then delete this line\n  export const friendlyUser: FriendlyText<User> = {\n-   name: {rt$label: ''},\n+   name: {rt$label: 'Name'},\n  };\n\nFix — author the real labels and error messages for the const, then\ndelete the whole `@todo` line (the compiler never removes it for you).",
  },
  FT021: {
    headline: 'Stale `@rtOrphan` carcass — run `ts-runtypes gen --prune` to remove it (or restore the type).',
    detail:
      'The reconcile commented this FriendlyText const out because its source\ntype was deleted or renamed. The carcass preserves your authored labels\nand messages so a reappearing type can restore them — but a clean,\ncommitted mirror has none.\n\nFix — if the type is really gone, prune the carcass:\n  ts-runtypes gen --prune\n\nFix — if the type was renamed, re-run the reconcile; a matching carcass\nis restored with your values intact:\n  ts-runtypes gen <source.ts> <NewName> --update',
  },
  FT022: {
    headline: 'Stale `@rtOrphanChild` field carcass — run `ts-runtypes gen --prune` to remove it (or restore the field).',
    detail:
      "The reconcile commented this field out because the source type no longer\ndeclares it. The carcass preserves your authored value inline — but a\nclean, committed mirror has none.\n\nExample:\n  export const friendlyUser: FriendlyText<User> = {\n-   /* @rtOrphanChild nick: {rt$label: 'Nickname'}, */\n    name: {rt$label: 'Name'},\n  };\n\nFix — if the field is really gone: `ts-runtypes gen --prune`.\nFix — if the field was renamed, re-run `--update`; the authored value\nmoves to the renamed field when the ids match.",
  },
  GE000: {
    headline: 'Cannot read enrichment mirror file: {0}',
    detail:
      'The drift check could not read this mirror file (permissions, a broken\nsymlink, or a race with a concurrent write).\n\nFix — make the file readable and re-run `ts-runtypes gen --check`.',
  },
  GE001: {
    headline:
      'Mirror location drift — the source maps to `{0}` but this file lives at `{1}`; re-run `ts-runtypes gen` to relocate.',
    detail:
      'Each source file mirrors to ONE computed path per family under the\nenrich root (friendly/… and mock/…, plus per-locale translation twins).\nThis file is not at its computed location — usually after a source move,\nan enrich-dir change, or a pre-split combined mirror that still needs\nmigrating.\n\nFix — re-run the generator; it writes the per-family files at the right\npaths and migrates a legacy combined mirror:\n  ts-runtypes gen <source.ts> <Type> --update',
  },
  GE002: {
    headline: 'Breadcrumb source `{0}` no longer exists ({1}) — the mirror is orphaned; delete it or re-run `ts-runtypes gen`.',
    detail:
      "The mirror's `import type { … } from '<source>'` breadcrumb resolves to\na file that is gone. Its consts describe types that no longer exist\nanywhere.\n\nFix — if the source was deleted, delete the mirror file (both family\nfiles and any translation twins).\nFix — if the source moved, re-run the generator from the new location\nand prune the old mirror.",
  },
  GE003: {
    headline: 'Source {0} no longer declares type `{1}` — re-run `ts-runtypes gen`.',
    detail:
      'The mirror imports a type name its source file no longer declares (the\ntype was renamed or removed). The reconcile turns its consts into\n`@rtOrphan` carcasses so your authored values survive.\n\nFix — re-run the reconcile against the current source, then prune any\ncarcasses that should not come back:\n  ts-runtypes gen <source.ts> <Type> --update\n  ts-runtypes gen --prune',
  },
  HUK010: {
    headline:
      'Property `{0}` is a function — `hasUnknownKeys` does not handle function values, so this property is silently not checked.',
    detail:
      '`hasUnknownKeys` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  JCP001: {
    headline:
      'Internal error: JSON composite `{0}` references primitive entry `{1}` which was never rendered — please file an issue.',
  },
  MD001: {
    headline: 'Unknown field `{0}` — the type does not declare it, so this MockData entry is dead.',
    detail:
      "The MockData map names a field the source type does not have (removed,\nrenamed, or a typo). Its pool/range can never feed a generated mock.\n\nExample — `nick` no longer exists on the type:\n  interface User { name: string }\n  export const mockUser: MockData<User> = {\n    name: {pool: ['Ada', 'Linus']},\n-   nick: {pool: ['ada99']},\n  };\n\nFix — remove the entry, or re-run the reconcile so the mirror follows\nthe type:\n  ts-runtypes gen <source.ts> <Type> --update",
  },
  MD011: {
    headline: 'Property `{0}` collides with the reserved `rt$` enrichment prefix — the type cannot be enriched.',
    detail:
      '`rt$`-prefixed keys are reserved for enrichment meta (`rt$items`,\n`rt$length`, `rt$optional`, …); a source property with that prefix is\nindistinguishable from node meta, so gen refuses the type and the\nMockData checker reports it here.\n\nFix — rename the property (a plain `$` prefix is fine; only `rt$` is\nreserved):\n  interface Config {\n-   rt$size: number;\n+   $size: number;\n  }',
  },
  MD020: {
    headline: 'Unfilled `@todo` placeholder — fill in the real sample pools/ranges, then delete the `@todo` line.',
    detail:
      "The generator stamps a `@todo` line on every freshly-scaffolded const in\na MockData mirror file. It means \"this skeleton still carries generated\nblanks\". A clean, committed mirror has none.\n\nExample — a fresh scaffold:\n  /** @rtType User#a1b2c3 @rtIds {name: d4e5f6} */\n- // @todo: generated skeleton — fill in real data, then delete this line\n  export const mockUser: MockData<User> = {\n-   name: {pool: []},\n+   name: {pool: ['Ada Lovelace', 'Linus Torvalds']},\n  };\n\nFix — author realistic sample pools/ranges for the const, then delete\nthe whole `@todo` line (the compiler never removes it for you).",
  },
  MD021: {
    headline: 'Stale `@rtOrphan` carcass — run `ts-runtypes gen --prune` to remove it (or restore the type).',
    detail:
      'The reconcile commented this MockData const out because its source type\nwas deleted or renamed. The carcass preserves your authored pools and\nranges so a reappearing type can restore them — but a clean, committed\nmirror has none.\n\nFix — if the type is really gone, prune the carcass:\n  ts-runtypes gen --prune\n\nFix — if the type was renamed, re-run the reconcile; a matching carcass\nis restored with your values intact:\n  ts-runtypes gen <source.ts> <NewName> --update',
  },
  MD022: {
    headline: 'Stale `@rtOrphanChild` field carcass — run `ts-runtypes gen --prune` to remove it (or restore the field).',
    detail:
      "The reconcile commented this field out because the source type no longer\ndeclares it. The carcass preserves your authored value inline — but a\nclean, committed mirror has none.\n\nExample:\n  export const mockUser: MockData<User> = {\n-   /* @rtOrphanChild nick: {pool: ['ada99']}, */\n    name: {pool: ['Ada', 'Linus']},\n  };\n\nFix — if the field is really gone: `ts-runtypes gen --prune`.\nFix — if the field was renamed, re-run `--update`; the authored value\nmoves to the renamed field when the ids match.",
  },
  MKR001: {
    headline:
      '`{0}()` is being called at runtime just so the marker can read its return type — side effects, throws, or async work run for nothing.',
    detail:
      'Reflect-form markers (`createValidate(value)`, `getRunTypeId(value)`)\ninvoke their argument expression at runtime; the value is then discarded —\nonly its inferred type is used.\n\nFix — use the static form with `ReturnType<>`:\n  -  const isUser = createValidate({0}());\n+  const isUser = createValidate<ReturnType<typeof {0}>>();\n\nFix — pass an existing value of the desired type:\n  const existingUser: User = ...;\n  const isUser = getRunTypeId(existingUser);',
  },
  MKR003: {
    headline:
      'Marker call is inside a generic function — the type argument is unresolved, so no id can be computed at build time.',
    detail:
      "The build can only compute an id for a concrete type (`User`,\n`{name: string}`, etc.). A type parameter like `T` is abstract — it\ntakes a different value at each call site of the surrounding function,\nso a single id can't represent it.\n\nFix — inline the marker at each concrete call site:\n  function isUser(value: unknown) {\n    return createValidate<User>()(value);\n  }\n\nFix — accept a pre-computed id from the caller:\n  function makeChecker<T>(id: InjectRunTypeId<T>) {\n    return createValidate<T>(id);\n  }\n  const isUser = makeChecker<User>(getRunTypeId<User>());",
  },
  MKR004: {
    headline: "`noLiterals: true` has no effect here — the type argument doesn't resolve to literal values.",
    detail:
      "The `noLiterals` validate option skips the exact-value check that literal\ntypes (`'admin'`, `42`, `true`) compile to. This call's type argument\nresolves to a non-literal type, so there is no literal check to skip and\nthe option is a silent no-op.\n\nFix — drop the option:\n-  const isRole = createValidate<string>({noLiterals: true});\n+  const isRole = createValidate<string>();\n\nOr, if you meant to relax a literal union, point the option at the type\nthat actually carries the literals:\n  const isRole = createValidate<'admin' | 'user'>({noLiterals: true});",
  },
  MKR005: {
    headline: '`noIsArrayCheck: true` has no effect here — the type argument is not an array type.',
    detail:
      "The `noIsArrayCheck` validate option skips the `Array.isArray` guard that\narray types compile to. This call's type argument resolves to a non-array\ntype, so there is no guard to skip and the option is a silent no-op.\n\nFix — drop the option:\n-  const isUser = createValidate<User>({noIsArrayCheck: true});\n+  const isUser = createValidate<User>();\n\nOr point it at the array type you meant:\n  const isUsers = createValidate<User[]>({noIsArrayCheck: true});",
  },
  OVR001: {
    headline: 'Duplicate override for `{0}` — there can be exactly one override per (type, function).',
    detail:
      'Two `overrideX<T>()` declarations target the same type and the same\nfunction family. Which one wins would depend on scan order, so a second\noverride is rejected regardless of its body. The Related: line above\npoints at the override that was registered first.\n\nFix — keep one canonical override and delete the other:\n-  overrideValidate<User>((utl) => (value) => checkA(value));  // first\n-  overrideValidate<User>((utl) => (value) => checkB(value));  // duplicate\n+  overrideValidate<User>((utl) => (value) => checkA(value) && checkB(value));',
  },
  OVR002: {
    headline:
      'Override entry `{0}` references compiled function `{1}` which did not render — this would throw at runtime, so the build stops.',
    detail:
      "An override redirect body loads its compiled function from the cache\n(`usePureFn('cfn::…')`), but that module never rendered into the entry\ngraph. Calling the override would throw at runtime, so the build surfaces\nthe miss now. This is an internal emitter tripwire and should never fire\nin normal operation.\n\nFix — re-run with a clean cache first (delete the .runtypes cache dir /\nrestart the dev server). If it persists, the emitter dropped a module it\nshould have rendered: please open an issue with the type + override that\ntriggers it.",
  },
  OVR010: {
    headline: 'Overriding `validate` for this type also changes how JSON and binary decoders narrow unions containing it.',
    detail:
      "`validate` is a shared dependency across function families: JSON and\nbinary union decoders call the member validators to pick the matching\nbranch. An `overrideValidate<T>()` therefore reaches past\n`createValidate<T>()` — decoders of any union containing T now narrow\nwith YOUR function.\n\nThis is informational; the build proceeds. If the override should only\naffect direct validation, give the union members a discriminant so\ndecoders never fall back to member validation:\n  type Event = {kind: 'click'; x: number} | {kind: 'key'; code: string};",
  },
  PFE9004: {
    headline: 'Duplicate `registerPureFnFactory` for `{0}` with a different body — only one definition can win.',
    detail:
      'Two calls register the same `namespace::functionId` key but the factory\nbodies differ. The cache can only hold one definition, so one call site\nsilently loses its version at runtime.\n\nFix — make all registrations identical, or pick one canonical site and\ndelete the others. The Related: line above points at the first\nregistration the extractor saw.',
  },
  PFE9005: {
    headline: 'Pure-fn factory `{0}` uses destructured parameters — only simple identifier params are supported.',
    detail:
      "The build inlines parameter references by name when it materialises the\nfactory. Destructuring patterns (`({a, b})`, `([x, y])`) don't have a\nsingle name to substitute.\n\nFix — destructure inside the body:\n  -  registerPureFnFactory('ns::fn', (utl) => ({a, b}) => ...);\n+  registerPureFnFactory('ns::fn', (utl) => (params) => {\n+    const {a, b} = params;\n+    return ...;\n+  });",
  },
  PFE9006: {
    headline:
      "`this` is not allowed inside a `registerPureFnFactory` factory body — pure functions can't depend on a calling context.",
    detail:
      "Pure functions are materialised standalone at build time; there's no\n`this` to bind to.\n\nFix — replace `this` with an explicit parameter, or move the function\nout of the class/object method that owns the `this`:\n  registerPureFnFactory('ns::fn', (utl) => (self, input) => {\n    return self.field + input;\n  });",
  },
  PFE9007: {
    headline: '`async`/`await` is not allowed inside a `registerPureFnFactory` factory body.',
    detail:
      "Pure functions must run synchronously so the build can call them at\ncompile time. `async` introduces a Promise that won't resolve until\nruntime.\n\nFix — make the factory synchronous; move async work to the caller:\n  registerPureFnFactory('ns::fn', (utl) => {\n-   return async (input) => { const r = await heavy(); return r; };\n+   return (resolvedValue) => transform(resolvedValue);\n  });",
  },
  PFE9008: {
    headline: '`yield` / generators are not allowed inside a `registerPureFnFactory` factory body.',
    detail:
      "Generators carry resumption state that can't be materialised\nstatically.\n\nFix — return an array or a plain iterable instead:\n  registerPureFnFactory('ns::fn', (utl) => (input) => {\n    return [...computeAll(input)];\n  });",
  },
  PFE9009: {
    headline: '`import()` is not allowed inside a `registerPureFnFactory` factory body.',
    detail:
      'Dynamic imports load modules at runtime — the build needs every\ndependency available statically.\n\nFix — use a top-level `import` statement, or pass the imported module\nin as a parameter.',
  },
  PFE9010: {
    headline: '`{0}` is not allowed inside a `registerPureFnFactory` factory body.',
    detail:
      "Globals like `eval`, `Function`, `fetch`, `XMLHttpRequest`, `require`,\n`process`, `globalThis`, `window`, `document` are blocked from pure-fn\nbodies — they either execute arbitrary code or depend on a runtime\nenvironment the build can't reproduce.\n\nFix — remove the reference, or pass the needed value in as a parameter.",
  },
  PFE9011: {
    headline:
      "`{0}` is captured from outer scope inside a `registerPureFnFactory` factory — pure functions can't reach outside their own body.",
    detail:
      "The build inlines factory bodies without their lexical environment, so\nany free variable becomes `undefined` at runtime.\n\nFix — pass `{0}` in as a parameter:\n  registerPureFnFactory('ns::fn', (utl) => ({0}, value) => ...);\n\nFix — inline its value if it's a known constant:\n  registerPureFnFactory('ns::fn', (utl) => (value) => {\n    const {0} = 42;\n    ...\n  });\n\nFix — import `{0}` directly inside the factory if it's a module export.",
  },
  PFE9012: {
    headline:
      "Pure-fn `{0}` is referenced by a RT function but never registered — call `registerPureFnFactory('{1}::{2}', …)` first.",
    detail:
      "A RT validator/encoder calls `utl.usePureFn('{0}')` (or similar) but\nno `registerPureFnFactory` call with that namespace+function pair was\nfound in any scanned source file.\n\nFix — register the function in the expected location ({3}, if known).\nMake sure the file is included in the scan set.",
  },
  PFE9013: {
    headline: '`{0}.{1}` dependency argument must be a string literal or a same-scope `const` string.',
    detail:
      "`utl.usePureFn` / `utl.getPureFn` need a static key so the build can\nverify the referenced pure-fn is registered.\n\nFix:\n  -  const key = buildKey();\n-  return utl.usePureFn(key)(input);\n+  return utl.usePureFn('rt::myFn')(input);",
  },
  PFN001: {
    headline: '`PureFunction<F>` argument must be an INLINE arrow or function expression.',
    detail:
      "The build extracts and AOT-compiles the function body, so it must see the\nliteral inline at the call site. A named reference — even a module-private\n`const f = …` or `function f(){}` — is not accepted, because the literal\nmust have no handle anything else can reach; the compiled copy is then the\nonly one that can run. (An imported or exported literal is rejected as PFN002.)\n\nFix — inline the function at the call site:\n-  const validate = (v: unknown) => typeof v === 'string';\n-  registerValidator(validate);\n+  registerValidator((v: unknown) => typeof v === 'string');",
  },
  PFN002: {
    headline: '`PureFunction<F>` literal must not be imported or exported — the compiled copy must be the only one that can run.',
    detail:
      "The build extracts and AOT-compiles the function body, and the compiled\ncopy is the single source of truth. If the original literal stays reachable\nas a value — imported from another module, or exported so another module can\nimport it — a caller could invoke the un-compiled function and diverge from\nthe compiled behaviour.\n\nUnder the literal-only rule a named binding isn't allowed at all (see PFN001),\nso the fix is to inline the function at the call site:\n-  import {validate} from './validators';   // imported — rejected\n-  export const validate = (v) => …;        // exported — rejected\n+  registerValidator((v: unknown) => typeof v === 'string');   // inline — ok",
  },
  PJ001: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  PJ002: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  PJ003: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  PJ004: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  PJ005: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  PJ010: {
    headline:
      'Property `{0}` is a function — `prepareForJson` does not handle function values, so this property is silently not encoded.',
    detail:
      '`prepareForJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  PJ011: {
    headline: "Method `{0}` is silently not encoded by `prepareForJson` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`prepareForJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  PJ012: {
    headline: "Static member `{0}` is silently not encoded by `prepareForJson` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`prepareForJson` operates on instance shape, so statics are excluded.',
  },
  PJ013: {
    headline: "Symbol-keyed property `{0}` is silently not encoded by `prepareForJson` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `prepareForJson` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  PJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `prepareForJson` drops them, so the union is encoded as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `prepareForJson` encoded only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `prepareForJson` throws at build time instead.',
  },
  PJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `prepareForJson` drops it, so this property is silently not encoded.',
    detail:
      '`prepareForJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `prepareForJson` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  PJS001: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  PJS002: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  PJS003: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  PJS004: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  PJS005: {
    headline: 'Cannot encode `{0}` to JSON.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  PJS010: {
    headline:
      'Property `{0}` is a function — `prepareForJsonSafe` does not handle function values, so this property is silently not encoded.',
    detail:
      '`prepareForJsonSafe` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  PJS011: {
    headline: "Method `{0}` is silently not encoded by `prepareForJsonSafe` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`prepareForJsonSafe` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  PJS012: {
    headline: "Static member `{0}` is silently not encoded by `prepareForJsonSafe` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`prepareForJsonSafe` operates on instance shape, so statics are excluded.',
  },
  PJS013: {
    headline:
      "Symbol-keyed property `{0}` is silently not encoded by `prepareForJsonSafe` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `prepareForJsonSafe` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  PJS014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `prepareForJsonSafe` drops them, so the union is encoded as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `prepareForJsonSafe` encoded only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `prepareForJsonSafe` throws at build time instead.',
  },
  PJS015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `prepareForJsonSafe` drops it, so this property is silently not encoded.',
    detail:
      '`prepareForJsonSafe` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `prepareForJsonSafe` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  RJ001: {
    headline: 'Cannot decode `{0}` from JSON.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  RJ002: {
    headline: 'Cannot decode `{0}` from JSON.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  RJ003: {
    headline: 'Cannot decode `{0}` from JSON.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  RJ004: {
    headline: 'Cannot decode `{0}` from JSON.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  RJ005: {
    headline: 'Cannot decode `{0}` from JSON.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  RJ010: {
    headline:
      'Property `{0}` is a function — `restoreFromJson` does not handle function values, so this property is silently not decoded.',
    detail:
      '`restoreFromJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  RJ011: {
    headline: "Method `{0}` is silently not decoded by `restoreFromJson` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`restoreFromJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  RJ012: {
    headline: "Static member `{0}` is silently not decoded by `restoreFromJson` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`restoreFromJson` operates on instance shape, so statics are excluded.',
  },
  RJ013: {
    headline: "Symbol-keyed property `{0}` is silently not decoded by `restoreFromJson` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `restoreFromJson` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  RJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `restoreFromJson` drops them, so the union is decoded as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `restoreFromJson` decoded only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `restoreFromJson` throws at build time instead.',
  },
  RJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `restoreFromJson` drops it, so this property is silently not decoded.',
    detail:
      '`restoreFromJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `restoreFromJson` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  SJ001: {
    headline: 'Cannot stringify `{0}` to a JSON string.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  SJ002: {
    headline: 'Cannot stringify `{0}` to a JSON string.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  SJ003: {
    headline: 'Cannot stringify `{0}` to a JSON string.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  SJ004: {
    headline: 'Cannot stringify `{0}` to a JSON string.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  SJ005: {
    headline: 'Cannot stringify `{0}` to a JSON string.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  SJ010: {
    headline:
      'Property `{0}` is a function — `stringifyJson` does not handle function values, so this property is silently not stringified.',
    detail:
      '`stringifyJson` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  SJ011: {
    headline: "Method `{0}` is silently not stringified by `stringifyJson` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`stringifyJson` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  SJ012: {
    headline: "Static member `{0}` is silently not stringified by `stringifyJson` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`stringifyJson` operates on instance shape, so statics are excluded.',
  },
  SJ013: {
    headline:
      "Symbol-keyed property `{0}` is silently not stringified by `stringifyJson` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `stringifyJson` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  SJ014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `stringifyJson` drops them, so the union is stringified as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `stringifyJson` stringified only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `stringifyJson` throws at build time instead.',
  },
  SJ015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `stringifyJson` drops it, so this property is silently not stringified.',
    detail:
      '`stringifyJson` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `stringifyJson` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  SUK010: {
    headline:
      'Property `{0}` is a function — `stripUnknownKeys` does not handle function values, so this property is silently not stripped.',
    detail:
      '`stripUnknownKeys` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  TB001: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "`never` is the empty type — no value can ever inhabit it. A field\ntyped `never` cannot carry a runtime value, so there is nothing to\nencode/decode/validate.\n\nFix — use `unknown` if you really want to accept any value:\n  interface User {\n-   tag: never;\n+   tag: unknown;  // narrow before use\n  }\n\nFix — pick a concrete type matching your real data:\n  interface User {\n-   tag: never;\n+   tag: 'pending' | 'active' | 'done';\n  }",
  },
  TB002: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  TB003: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "Functions have no value form to serialise — their closure, prototype,\nand bound state aren't representable in JSON or binary.\n\nFix — drop the function from your type, or replace it with the data the\nfunction would produce:\n  interface User {\n-   getName: () => string;\n+   name: string;\n  }",
  },
  TB004: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "Arrays of un-serialisable elements (`symbol[]`, `(() => void)[]`,\n`Map<K, V>[]`, etc.) can't be encoded — every element would need to be\nrepresentable, and these aren't. Dropping individual elements would\nchange the array length, so the encoder refuses rather than silently\nshipping a different shape.\n\nFix — change the element type to something serialisable:\n  -  type Items = (() => void)[];\n+  type Items = string[];",
  },
  TB005: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  TB006: {
    headline: 'Cannot serialise `{0}` to binary.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  TB010: {
    headline:
      'Property `{0}` is a function — `toBinary` does not handle function values, so this property is silently not serialised.',
    detail:
      '`toBinary` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  TB011: {
    headline: "Method `{0}` is silently not serialised by `toBinary` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`toBinary` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  TB012: {
    headline: "Static member `{0}` is silently not serialised by `toBinary` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`toBinary` operates on instance shape, so statics are excluded.',
  },
  TB013: {
    headline: "Symbol-keyed property `{0}` is silently not serialised by `toBinary` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `toBinary` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  TB014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `toBinary` drops them, so the union is serialised as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `toBinary` serialised only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `toBinary` throws at build time instead.',
  },
  TB015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `toBinary` drops it, so this property is silently not serialised.',
    detail:
      '`toBinary` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `toBinary` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  TMP001: {
    headline:
      "Temporal type `{0}` resolved to `any` — the Temporal lib isn't in your tsconfig `lib`, so the generated validator would accept any value.",
    detail:
      'ts-runtypes reads types through TypeScript\'s lib definitions, so it\ncan only validate `Temporal.*` types when the Temporal namespace is loaded.\nWith the lib missing, `{0}` silently degrades to `any` and the validator\nbecomes a no-op that accepts everything — almost never what you intended.\n\nFix — add "ESNext.Temporal" to your tsconfig:\n  {\n    "compilerOptions": {\n      "lib": ["ES2023", "ESNext.Temporal"]\n    }\n  }',
  },
  UKE010: {
    headline:
      'Property `{0}` is a function — `unknownKeyErrors` does not handle function values, so this property is silently not checked.',
    detail:
      '`unknownKeyErrors` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  UKU010: {
    headline:
      'Property `{0}` is a function — `unknownKeysToUndefined` does not handle function values, so this property is silently not cleared.',
    detail:
      '`unknownKeysToUndefined` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  UKW010: {
    headline:
      'Property `{0}` is a function — `unknownKeysToUndefinedWire` does not handle function values, so this property is silently not cleared.',
    detail:
      '`unknownKeysToUndefinedWire` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  VE001: {
    headline: 'Cannot validate `{0}`.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  VE002: {
    headline: 'Cannot validate `{0}`.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  VE010: {
    headline:
      'Property `{0}` is a function — `validationErrors` does not handle function values, so this property is silently not checked.',
    detail:
      '`validationErrors` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  VE011: {
    headline: "Method `{0}` is silently not checked by `validationErrors` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`validationErrors` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  VE012: {
    headline: "Static member `{0}` is silently not checked by `validationErrors` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`validationErrors` operates on instance shape, so statics are excluded.',
  },
  VE013: {
    headline:
      "Symbol-keyed property `{0}` is silently not checked by `validationErrors` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `validationErrors` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  VE015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `validationErrors` drops it, so this property is silently not checked.',
    detail:
      '`validationErrors` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `validationErrors` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  VE020: {
    headline: '`validationErrors` on `any` / `unknown` always returns an empty error array — nothing is checked.',
    detail:
      'Same reason as VL021: `any` and `unknown` describe "anything", so the\nchecker has no structure to compare against. The returned error array\nwill always be empty.\n\nFix — narrow the type to the actual shape you expect:\n  -  const errors = createGetValidationErrors<unknown>()(value);\n+  const errors = createGetValidationErrors<User>()(value);',
  },
  VL001: {
    headline: 'Cannot validate `{0}`.',
    detail:
      "Built-in classes like `Map`, `Set`, `WeakMap`, `WeakSet`, `Int8Array`,\n`Uint8Array`, `Buffer`, and `Promise` carry runtime state that doesn't\nsurvive a JSON or binary round-trip. Their instance identity is lost the\nmoment they're serialised.\n\nFix — convert to a plain object/array before serialising:\n  // for Map<K, V>:\n  const data = Object.fromEntries(yourMap);\n  // for Set<T>:\n  const data = [...yourSet];\n  // for typed arrays:\n  const data = Array.from(yourBuffer);\n\nFix — change the field type to a serialisable shape:\n  interface User {\n-   tags: Set<string>;\n+   tags: string[];\n  }",
  },
  VL002: {
    headline: 'Cannot validate `{0}`.',
    detail:
      "Every `symbol` value carries a unique runtime identity (`Symbol() !==\nSymbol()` even with the same description). That identity disappears the\nmoment it's serialised, and two symbols can't be compared across realms,\nworkers, or process boundaries. A validator that asserts \"this is a\nsymbol\" gives a false sense of safety — the value can't actually\nround-trip.\n\nFix — use a stable string key (often a literal union):\n  -  type Status = symbol;\n+  type Status = 'pending' | 'active' | 'done';",
  },
  VL010: {
    headline:
      'Property `{0}` is a function — `validate` does not handle function values, so this property is silently not validated.',
    detail:
      '`validate` works on JSON-shaped data; functions don\'t survive JSON, so\nthe emitter drops them. The rest of the object\'s behaviour is unaffected.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If you need a stricter checker that fails on\nmissing/extra function-typed members, watch the project roadmap.',
  },
  VL011: {
    headline: "Method `{0}` is silently not validated by `validate` — methods aren't data.",
    detail:
      "Class and object methods aren't part of the serialisable shape, so\n`validate` excludes them. The rest of the type still works.\n\nIf you wanted the method's return value validated/serialised, expose it\nas a data property instead.",
  },
  VL012: {
    headline: "Static member `{0}` is silently not validated by `validate` — statics aren't part of instance data.",
    detail:
      'Class static members live on the class, not on individual instances.\n`validate` operates on instance shape, so statics are excluded.',
  },
  VL013: {
    headline: "Symbol-keyed property `{0}` is silently not validated by `validate` — symbol keys aren't JSON-representable.",
    detail:
      "JSON only supports string keys; symbol-keyed properties are dropped\nfrom the serialised form. `validate` follows the same rule.\n\nFix — use a string key:\n  -  [Symbol.for('id')]: string;\n+  id: string;",
  },
  VL014: {
    headline:
      "Union member(s) of type `{0}` can't be represented as data — `validate` drops them, so the union is validated as its remaining members.",
    detail:
      'A union projects to its serialisable members only: `DataOnly<Date | symbol>`\nis `Date`. The dropped member(s) ({0}) carry no JSON-shaped value (symbol,\nfunction, Promise, or a non-serialisable built-in like `Map` / `Set` /\ntyped arrays), so `validate` validated only the members that remain.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md. If EVERY member of the union is non-serialisable the\nprojection is `never`, and `validate` throws at build time instead.',
  },
  VL015: {
    headline:
      'Property `{0}` has a non-serialisable value type (symbol, Promise, or a non-serialisable built-in) — `validate` drops it, so this property is silently not validated.',
    detail:
      '`validate` works on JSON-shaped data. A property whose value is a symbol,\na Promise, or a non-serialisable built-in (typed array, ArrayBuffer, …) carries\nno JSON-shaped value, so it is dropped: `DataOnly<{ {0}: symbol }>` is `{}`.\nThe rest of the object\'s behaviour is unaffected.\n\nNote the difference from a property that is only STRUCTURALLY unserialisable —\n`{0}: symbol[]` or `{0}: Map<string, symbol>` — which CANNOT be safely\ndropped (DataOnly keeps it as `never[]`): there `validate` throws at build\ntime instead.\n\nThis is by design — see the "validate contract — serializable data only"\nsection in CLAUDE.md.',
  },
  VL021: {
    headline: '`validate` on `any` / `unknown` always returns true — the validator accepts every value.',
    detail:
      '`any` and `unknown` describe "anything", so a structural validator has\nnothing to check. The resulting function passes for every input —\nincluding the ones you probably wanted to reject.\n\nFix — narrow the type to the actual shape you expect:\n  -  const isUser = createValidate<unknown>();\n+  const isUser = createValidate<User>();',
  },
};

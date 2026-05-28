// Public entry for the string-format catalog. Each concrete format
// type is exported from its own `string/*.runtype.ts` file; this
// module re-exports them so consumers see a single import surface:
//
//   import type {FormatString, FormatUUIDv4} from '@mionjs/ts-go-type-formats/StringFormats';
//
// The runtype classes themselves register with the JS runtime
// registry as a side effect of being imported, so importing the
// type alone is enough — TypeScript's import-type elision would
// otherwise drop the side-effect, hence the duplicate value imports.
// Phase 1 scaffold: no string formats registered yet. Each subsequent
// phase appends one block per format family.

// Side-effect imports for runtime registration land here as each
// format module ships in subsequent phases. Keeping the block in
// place (commented for now) makes the wiring obvious and avoids a
// later sweep through history to find the right place.
// import './string/stringFormat.runtype.ts';
// import './string/uuid.runtype.ts';

// Type re-exports — same story; uncommented per phase.
// export type {FormatString} from './string/stringFormat.runtype.ts';
// export type {FormatUUIDv4} from './string/uuid.runtype.ts';

// Public surface placeholder. Removing this `export {}` once a real
// type ships above is fine — TypeScript only needs a single export
// for the module to be treated as a module.
export {};

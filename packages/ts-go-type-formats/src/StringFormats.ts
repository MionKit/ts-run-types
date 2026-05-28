// Public entry for the string-format catalog. Every type alias lives in
// `./string/stringFormats.ts`; the per-kind mock dispatch registers
// itself as a side effect of importing `./string/stringFormatMock.ts`.
//
// Consumers see a single import surface:
//   import type {FormatString, FormatUUIDv4} from '@mionjs/ts-go-type-formats';

// Side-effect: registers the single string-format mock fn
// (mockStringFormat) with the runtime mock registry. Kept as a bare
// import so it survives import-type elision when a consumer only pulls
// the type aliases below.
import './string/stringFormatMock.ts';

// Re-export the full string-format type surface.
export type * from './string/stringFormats.ts';

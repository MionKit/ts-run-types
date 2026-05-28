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

// Side-effect imports register each format with the runtime
// formatRegistry at module load. Subsequent phases append to this
// block.
import './string/stringFormat.runtype.ts';
import './string/uuid.runtype.ts';
import './string/date.runtype.ts';
import './string/time.runtype.ts';
import './string/dateTime.runtype.ts';
import './string/ip.runtype.ts';
import './string/domain.runtype.ts';
import './string/email.runtype.ts';
import './string/url.runtype.ts';

// Type aliases — public consumer-facing surface. Concrete classes
// (StringRunTypeFormat, ...) intentionally NOT re-exported: users
// hold the format types, never construct the runtype-format
// instances themselves.
export type {FormatString, StringParams} from './string/stringFormat.runtype.ts';
export type {FormatUUIDv4, FormatUUIDv7, FormatParams_UUID} from './string/uuid.runtype.ts';
export type {FormatStringDate, FormatParams_Date, DateFmt} from './string/date.runtype.ts';
export type {FormatStringTime, FormatParams_Time, TimeFmt} from './string/time.runtype.ts';
export type {FormatStringDateTime, FormatParams_DateTime} from './string/dateTime.runtype.ts';
export type {
  FormatIP,
  FormatIPv4,
  FormatIPv6,
  FormatIPWithPort,
  FormatIPv4WithPort,
  FormatIPv6WithPort,
  FormatParams_IP,
} from './string/ip.runtype.ts';
export type {
  FormatDomain,
  FormatDomainUnicode,
  FormatDomainPunycode,
  FormatDomainStrict,
  FormatParams_Domain,
} from './string/domain.runtype.ts';
export type {FormatEmail, FormatEmailPunycode, FormatEmailStrict, FormatParams_Email} from './string/email.runtype.ts';
export type {FormatUrl, FormatUrlHttp, FormatUrlFile, FormatParams_Url} from './string/url.runtype.ts';

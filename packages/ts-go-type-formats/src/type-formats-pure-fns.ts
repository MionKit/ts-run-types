// Registration module for every pure fn the Go-side format emitters
// reach via `utl.getPureFn('mionFormats::<name>')`. Each cpf_* below
// is registered at module load; importing this file from
// `src/index.ts` (which is the package's public surface) is enough
// to guarantee the registrations happen before any user code
// references a format type.
//
// Mirrors mion's `packages/type-formats/src/type-formats-pure-fns.ts`
// minus the deepkit-coupled `getPureFn` typing — our utl is the
// runtime helper exported from @mionjs/ts-go-run-types.
//
// Phase 3 ships cpf_isUUID. Subsequent phases append more.

import {registerPureFnFactory} from '@mionjs/ts-go-run-types';

// FormatParams_UUID — the wire-shape params object the Go emitter
// passes to cpf_isUUID at runtime. Mirrors mion's FormatParams_UUID
// keeping only what the validator needs.
interface FormatParams_UUID {
  version: string;
}

// cpf_isUUID — port of mion's same-named pure fn. Length + dash
// positions + version digit at slot 14 + hex character class on
// every other slot. Matches the runtime behaviour of the canonical
// UUIDv4 / UUIDv7 patterns without pulling in a regex engine.
export const cpf_isUUID = registerPureFnFactory('mionFormats', 'isUUID', function () {
  return function _isUUID(value: string, params: FormatParams_UUID): boolean {
    if (typeof value !== 'string' || value.length !== 36) return false;
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        if (value[i] !== '-') return false;
      } else if (i === 14) {
        if (value[i] !== params.version) return false;
      } else {
        const charCode = value.charCodeAt(i);
        const is09 = charCode >= 48 && charCode <= 57;
        const isaf = charCode >= 97 && charCode <= 102;
        const isAF = charCode >= 65 && charCode <= 70;
        if (!(is09 || isaf || isAF)) return false;
      }
    }
    return true;
  };
});

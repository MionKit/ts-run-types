// Shared JIT lookup helper used by every create*-style factory in this
// package (createJsonEncoder, createJsonDecoder, createBinaryEncoder,
// createBinaryDecoder, …). Lives in its own module so the binary
// surface (`createBinary.ts`) and the JSON / validation surface
// (`createJitFunctions.ts`) can both import it without one having to
// depend on the other — letting bundlers tree-shake the binary half
// when consumers don't use it.

import {getJitUtils} from './jitUtils.ts';
import type {AnyFn, JitCompiledFn} from './types.ts';

/** Look up the JIT-compiled entry registered at `<prefix>_<id>` on the
 *  jitUtils singleton. Returns the entry's `fn` when present, the
 *  caller-supplied identity fallback when the runtype is registered
 *  but its factory collapsed to a noop, and throws otherwise. **/
export function lookupJitFn<F extends AnyFn>(callerName: string, prefix: string, id: string, identityFn: F): F {
  const utils = getJitUtils();
  const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no JitCompiledFn entry for "${prefix}_${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

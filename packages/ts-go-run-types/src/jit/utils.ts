/* ###############
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

// Minimal helper set required by jitUtils. Lifted from
// mion/packages/core/src/utils.ts (only the three helpers jitUtils.ts uses)
// with `getENV` inlined so the module stays browser-safe and has no other
// internal dependencies.

import {getJitUtils} from './jitUtils.ts';
import type {CompiledPureFunction} from './types.ts';

/** Stores singleton state on globalThis so it survives dual module loading (e.g. CJS + ESM copies).
 *  noExternal remains the primary mechanism — this is defense-in-depth and a code-level signal that
 *  the binding is intended to be a process-wide singleton. */
export function getOrCreateGlobal<T>(key: string, factory: () => T): T {
    const sym = Symbol.for(key);
    return ((globalThis as any)[sym] ??= factory()) as T;
}

let isTest: boolean | undefined = undefined;
export function isTestEnv() {
    if (isTest !== undefined) return isTest;
    isTest = readEnv('VITEST') !== undefined || readEnv('NODE_ENV') === 'test';
    return isTest;
}

/**
 * Restores the full state of a compiled pure function,
 * The pure function itself can't be compiled to code as it contains references to context code and jitUtils.
 * So we need to restore it manually by invoking the closure function.
 * */
export function initPureFunction(compiled: CompiledPureFunction): asserts compiled is Required<CompiledPureFunction> {
    if (compiled.fn) return;
    compiled.fn = compiled.createPureFn(getJitUtils());
}

/** Browser-safe `process.env[key]` read — returns undefined where `process` is absent.
 *  Goes through `globalThis` so the package's tsconfig doesn't need `@types/node`. */
function readEnv(key: string): string | undefined {
    const proc = (globalThis as any).process;
    if (proc && proc.env) return proc.env[key] as string | undefined;
    return undefined;
}

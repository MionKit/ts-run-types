// Node loader for the resolver WASM - for the test suite (and any Node/SSR host).
// The browser loader (src/core/wasmLoader.ts) needs document/fetch; this one
// reads the package's built assets, runs Go's wasm_exec.js as a classic script
// via vm.runInThisContext (it defines globalThis.Go), instantiates the module,
// and returns the engine's { versions, dispatch } Resolver shape. Inject it with
// setResolver(). Assets are produced by scripts/build-wasm.sh.
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import type {Resolver} from '../src/core/index.ts';

const ASSETS = fileURLToPath(new URL('../assets/', import.meta.url));
export const WASM_PATH = `${ASSETS}ts-runtypes.wasm`;
export const WASM_EXEC_PATH = `${ASSETS}wasm_exec.js`;

// assetsBuilt reports whether build-wasm.sh has produced the assets yet.
export function assetsBuilt(): boolean {
  return existsSync(WASM_PATH) && existsSync(WASM_EXEC_PATH);
}

interface ResolverGlobals {
  Go?: new () => {run: (instance: WebAssembly.Instance) => Promise<void>; importObject: WebAssembly.Imports};
  __tsRunTypesDispatch?: (requestJSON: string) => string;
  __tsRunTypesOnReady?: (version: string, tsgo: string) => void;
}

export async function loadNodeResolver(): Promise<Resolver> {
  const globals = globalThis as unknown as ResolverGlobals;
  if (!globals.Go) vm.runInThisContext(readFileSync(WASM_EXEC_PATH, 'utf8'));
  const Go = globals.Go;
  if (!Go) throw new Error('wasm_exec.js did not define globalThis.Go');

  const go = new Go();
  const ready = new Promise<{version: string; tsgo: string}>((resolve) => {
    globals.__tsRunTypesOnReady = (version, tsgo) => resolve({version, tsgo});
  });

  const {instance} = await WebAssembly.instantiate(readFileSync(WASM_PATH), go.importObject);
  // Do not await - go.run settles only when the Go side exits, and ours blocks
  // forever to keep the dispatch callback alive.
  void go.run(instance);
  const versions = await ready;

  const rawDispatch = globals.__tsRunTypesDispatch;
  if (typeof rawDispatch !== 'function') throw new Error('WASM did not install __tsRunTypesDispatch');

  function dispatch(request: Record<string, unknown>): Record<string, unknown> {
    const parsed = JSON.parse(rawDispatch!(JSON.stringify(request))) as Record<string, unknown>;
    if (parsed.error) throw new Error(`ts-runtypes: ${String(parsed.error)}`);
    return parsed;
  }

  return {versions, dispatch};
}

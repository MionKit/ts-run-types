// Browser loader for the ts-runtypes resolver compiled to WebAssembly.
//
// The .wasm + Go's wasm_exec.js shim are package assets (built by
// scripts/build-wasm.sh). A bundler resolves their URLs via `new URL(…,
// import.meta.url)`; consumers can override both through ResolverOptions (e.g.
// when serving the assets from a CDN). wasm_exec.js is a classic script that
// defines `globalThis.Go`, so it is injected by URL rather than imported.

export interface ResolverVersions {
  version: string;
  tsgo: string;
}

export interface Resolver {
  versions: ResolverVersions;
  dispatch: (request: Record<string, unknown>) => Record<string, unknown>;
}

export interface ResolverOptions {
  wasmUrl?: string | URL;
  wasmExecUrl?: string | URL;
}

interface GoRuntime {
  run: (instance: WebAssembly.Instance) => Promise<void>;
  importObject: WebAssembly.Imports;
}

type GoConstructor = new () => GoRuntime;

interface ResolverGlobals {
  Go?: GoConstructor;
  __tsRunTypesDispatch?: (requestJSON: string) => string;
  __tsRunTypesOnReady?: (version: string, tsgo: string) => void;
}

function globals(): ResolverGlobals {
  return globalThis as unknown as ResolverGlobals;
}

const DEFAULT_WASM_URL = new URL('../../assets/ts-runtypes.wasm', import.meta.url);
const DEFAULT_WASM_EXEC_URL = new URL('../../assets/wasm_exec.js', import.meta.url);

let loaderPromise: Promise<Resolver> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (globals().Go) return resolve();
    const existing = document.querySelector<HTMLScriptElement>('script[data-rt-wasm-exec]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('failed to load wasm_exec.js')));
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.rtWasmExec = 'true';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('failed to load wasm_exec.js')));
    document.head.appendChild(script);
  });
}

// loadResolver returns { versions, dispatch }, instantiating the module on the
// first call and reusing it thereafter (shared promise).
export function loadResolver(options: ResolverOptions = {}): Promise<Resolver> {
  if (loaderPromise) return loaderPromise;

  const wasmUrl = String(options.wasmUrl ?? DEFAULT_WASM_URL);
  const wasmExecUrl = String(options.wasmExecUrl ?? DEFAULT_WASM_EXEC_URL);

  loaderPromise = (async (): Promise<Resolver> => {
    await loadScriptOnce(wasmExecUrl);
    const Go = globals().Go;
    if (!Go) throw new Error('wasm_exec.js did not define globalThis.Go');

    const go = new Go();
    const ready = new Promise<ResolverVersions>((resolve) => {
      globals().__tsRunTypesOnReady = (version, tsgo) => resolve({version, tsgo});
    });

    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error(`failed to fetch ${wasmUrl}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const {instance} = await WebAssembly.instantiate(bytes, go.importObject);

    // Do not await — go.run resolves only when the Go side exits, and ours
    // blocks forever to keep the callback alive.
    void go.run(instance);
    const versions = await ready;

    const rawDispatch = globals().__tsRunTypesDispatch;
    if (typeof rawDispatch !== 'function') throw new Error('WASM did not install __tsRunTypesDispatch');

    function dispatch(request: Record<string, unknown>): Record<string, unknown> {
      const parsed = JSON.parse(rawDispatch!(JSON.stringify(request))) as Record<string, unknown>;
      if (parsed.error) throw new Error(`ts-runtypes: ${String(parsed.error)}`);
      return parsed;
    }

    return {versions, dispatch};
  })();

  loaderPromise.catch(() => {
    loaderPromise = null;
  });
  return loaderPromise;
}

// useRuntypesPlayground — load the ts-runtypes resolver (compiled to
// WebAssembly) in the browser and drive it from the playground component.
//
// The .wasm + Go's wasm_exec.js runtime shim are served as static assets from
// /playground/ (staged by container-website/scripts/build-playground.sh). The
// module installs one synchronous callback on globalThis:
//   __tsRunTypesDispatch(requestJSON) -> responseJSON
// using the exact protocol.Request / protocol.Response wire shapes the native
// CLI speaks. This composable wraps it in a small API and, crucially, loads the
// module ONCE per page (shared promise) so repeated mounts reuse it.
//
// Client-only: it touches window / WebAssembly / dynamic <script>, so callers
// must invoke it inside onMounted (or behind <ClientOnly>), never during SSR.

// The marker ambient declaration. The resolver gates `getRunTypeId<T>()`
// recognition on an import from a module named `ts-runtypes`; this ambient
// `declare module` satisfies that without a real package on a virtual disk.
// Kept in sync with internal/testfixtures/runtypes.d.ts (the canonical fixture).
const MARKER_DTS = `
declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {
    readonly __rtInjectTypeFnArgsBrand?: T;
    readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3];
  };
  export function createValidate<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
}
`;

const WASM_URL = '/playground/ts-runtypes.wasm';
const WASM_EXEC_URL = '/playground/wasm_exec.js';

export interface RunTypeNode {
  id: string;
  kind: number;
  family?: string;
  typeName?: string;
  name?: string;
  [key: string]: unknown;
}

export interface DumpResult {
  rootId: string | null;
  root: RunTypeNode | null;
  runTypes: RunTypeNode[];
  sites: Array<Record<string, unknown>>;
  diagnostics: Array<Record<string, unknown>>;
}

export interface Resolver {
  versions: { version: string; tsgo: string };
  dispatch: (request: Record<string, unknown>) => Record<string, unknown>;
  dumpType: (typeSource: string) => DumpResult;
}

declare global {
  interface Window {
    Go?: new () => {
      run: (instance: WebAssembly.Instance) => Promise<void>;
      importObject: WebAssembly.Imports;
    };
    __tsRunTypesDispatch?: (requestJSON: string) => string;
    __tsRunTypesOnReady?: (version: string, tsgo: string) => void;
  }
}

let loaderPromise: Promise<Resolver> | null = null;

// loadScriptOnce injects Go's wasm_exec.js (a classic script that defines
// window.Go) exactly once. It is not an ES module, so it is loaded by URL
// rather than imported.
function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Go) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[data-rt-wasm-exec]`);
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

// useRuntypesPlayground returns the shared resolver promise, instantiating the
// WASM module on first call.
export function useRuntypesPlayground(): Promise<Resolver> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = (async (): Promise<Resolver> => {
    await loadScriptOnce(WASM_EXEC_URL);
    if (!window.Go) throw new Error('wasm_exec.js did not define window.Go');

    const go = new window.Go();

    const ready = new Promise<{ version: string; tsgo: string }>((resolve) => {
      window.__tsRunTypesOnReady = (version, tsgo) => resolve({ version, tsgo });
    });

    // Fetch + instantiate (not instantiateStreaming) so a wrong static-asset
    // MIME type can't break loading.
    const response = await fetch(WASM_URL);
    if (!response.ok) throw new Error(`failed to fetch ${WASM_URL}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);

    // Do not await — go.run resolves only when the Go side exits, and ours
    // blocks forever to keep the callback alive.
    void go.run(instance);
    const versions = await ready;

    const rawDispatch = window.__tsRunTypesDispatch;
    if (typeof rawDispatch !== 'function') {
      throw new Error('WASM did not install __tsRunTypesDispatch');
    }

    function dispatch(request: Record<string, unknown>): Record<string, unknown> {
      const responseJSON = rawDispatch!(JSON.stringify(request));
      const parsed = JSON.parse(responseJSON);
      if (parsed.error) throw new Error(`ts-runtypes: ${parsed.error}`);
      return parsed;
    }

    function dumpType(typeSource: string): DumpResult {
      const fileName = 'playground.ts';
      const source = [
        `import { getRunTypeId } from 'ts-runtypes';`,
        `type __RtPlaygroundType = ${typeSource};`,
        `getRunTypeId<__RtPlaygroundType>();`,
        ``,
      ].join('\n');

      dispatch({ op: 'setSources', sources: { 'ts-runtypes.d.ts': MARKER_DTS, [fileName]: source } });
      const scan = dispatch({ op: 'scanFiles', files: [fileName], includeRunTypes: true }) as {
        runTypes?: RunTypeNode[];
        sites?: Array<{ id?: string }>;
        diagnostics?: Array<Record<string, unknown>>;
      };

      const runTypes = scan.runTypes ?? [];
      const rootId = scan.sites?.[0]?.id ?? null;
      const root = runTypes.find((node) => node.id === rootId) ?? runTypes[0] ?? null;
      return {
        rootId,
        root,
        runTypes,
        sites: scan.sites ?? [],
        diagnostics: scan.diagnostics ?? [],
      };
    }

    return { versions, dispatch, dumpType };
  })();

  // Reset on failure so a later mount can retry (e.g. .wasm not yet staged).
  loaderPromise.catch(() => {
    loaderPromise = null;
  });

  return loaderPromise;
}

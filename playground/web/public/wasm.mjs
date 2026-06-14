// wasm.mjs — load the ts-runtypes resolver (compiled to WebAssembly) in the
// browser and expose its single synchronous dispatch callback.
//
// The .wasm + Go's wasm_exec.js shim are staged under /playground/ by
// build.sh. The module installs one global callback:
//   __tsRunTypesDispatch(requestJSON) -> responseJSON
// speaking the exact protocol.Request / protocol.Response wire shapes the
// native CLI speaks. We load it once (shared promise) and wrap dispatch so a
// protocol-level error surfaces as a thrown Error.

const WASM_URL = '/playground/ts-runtypes.wasm';
const WASM_EXEC_URL = '/playground/wasm_exec.js';

let loaderPromise = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (window.Go) return resolve();
    const existing = document.querySelector('script[data-rt-wasm-exec]');
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
// first call and reusing it thereafter.
export function loadResolver() {
  if (loaderPromise) return loaderPromise;

  loaderPromise = (async () => {
    await loadScriptOnce(WASM_EXEC_URL);
    if (!window.Go) throw new Error('wasm_exec.js did not define window.Go');

    const go = new window.Go();
    const ready = new Promise((resolve) => {
      window.__tsRunTypesOnReady = (version, tsgo) => resolve({ version, tsgo });
    });

    const response = await fetch(WASM_URL);
    if (!response.ok) throw new Error(`failed to fetch ${WASM_URL}: ${response.status}`);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);

    // Do not await — go.run resolves only when the Go side exits, and ours
    // blocks forever to keep the callback alive.
    void go.run(instance);
    const versions = await ready;

    const rawDispatch = window.__tsRunTypesDispatch;
    if (typeof rawDispatch !== 'function') throw new Error('WASM did not install __tsRunTypesDispatch');

    function dispatch(request) {
      const parsed = JSON.parse(rawDispatch(JSON.stringify(request)));
      if (parsed.error) throw new Error(`ts-runtypes: ${parsed.error}`);
      return parsed;
    }

    return { versions, dispatch };
  })();

  loaderPromise.catch(() => {
    loaderPromise = null;
  });
  return loaderPromise;
}

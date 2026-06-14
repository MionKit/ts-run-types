// runtypes-wasm — load the ts-runtypes resolver compiled to WebAssembly and
// drive it from Node.js without spawning the native binary.
//
// The WASM module installs one synchronous callback on globalThis:
//   __tsRunTypesDispatch(requestJSON) -> responseJSON
// where both strings use the exact protocol.Request / protocol.Response wire
// shapes the native `--inline-server` CLI speaks. This module wraps that raw
// callback in a small, friendlier API:
//
//   const rt = await loadResolver();
//   rt.setSources({ 'index.ts': '...' });   // op: setSources
//   rt.scanFiles(['index.ts'], { includeRunTypes: true }); // op: scanFiles
//   rt.dump();                               // op: dump
//   rt.dumpType('{ id: number }');           // convenience: type string -> RunType graph
//
// Every method maps 1:1 to a CLI op, so the playground "calls the functions
// the same way we pass CLI params".

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Go's wasm_exec.js defines `globalThis.Go`. It is the official runtime shim
// shipped with the Go toolchain — we copy it next to the .wasm at build time.
async function importGoRuntime() {
  await import(join(here, 'wasm_exec.js'));
  if (typeof globalThis.Go !== 'function') {
    throw new Error('wasm_exec.js did not define globalThis.Go');
  }
  return globalThis.Go;
}

// loadResolver instantiates the WASM module and returns a handle whose methods
// each issue one protocol op against the in-memory tsgo resolver. The resolver
// lives for as long as the module is loaded; state (the structural type cache)
// persists across calls exactly like the long-lived CLI server.
export async function loadResolver(options = {}) {
  const wasmPath = options.wasmPath ?? join(here, 'ts-runtypes.wasm');
  const markerDtsPath = options.markerDtsPath ?? join(here, 'ts-runtypes.d.ts');

  const Go = await importGoRuntime();
  const go = new Go();

  const [wasmBytes, markerDts] = await Promise.all([
    readFile(wasmPath),
    readFile(markerDtsPath, 'utf8'),
  ]);

  // The Go program calls globalThis.__tsRunTypesOnReady(version, tsgo) once the
  // dispatch callback is installed. We resolve readiness off that signal rather
  // than racing the run() promise (which only settles when Go exits).
  const ready = new Promise((resolve) => {
    globalThis.__tsRunTypesOnReady = (version, tsgo) => resolve({ version, tsgo });
  });

  const { instance } = await WebAssembly.instantiate(wasmBytes, go.importObject);
  // Do not await — go.run resolves only when the Go side exits, and ours
  // blocks forever to keep the callback alive.
  go.run(instance);
  const versions = await ready;

  const rawDispatch = globalThis.__tsRunTypesDispatch;
  if (typeof rawDispatch !== 'function') {
    throw new Error('WASM did not install __tsRunTypesDispatch');
  }

  // dispatch sends one raw protocol request and returns the parsed response,
  // throwing if the resolver reported an error so callers can use try/catch.
  function dispatch(request) {
    const responseJSON = rawDispatch(JSON.stringify(request));
    const response = JSON.parse(responseJSON);
    if (response.error) {
      throw new Error(`ts-runtypes: ${response.error}`);
    }
    return response;
  }

  return {
    versions,
    dispatch,

    // setSources replaces the resolver's in-memory source overlay and rebuilds
    // the inferred Program against it. The marker ambient .d.ts is always
    // injected so `import { getRunTypeId } from 'ts-runtypes'` resolves.
    setSources(sources) {
      return dispatch({
        op: 'setSources',
        sources: { 'ts-runtypes.d.ts': markerDts, ...sources },
      });
    },

    // scanFiles walks the requested files for marker call sites and returns the
    // sites (+ the scoped RunType graph when includeRunTypes is set).
    scanFiles(files, { includeRunTypes = true } = {}) {
      return dispatch({ op: 'scanFiles', files, includeRunTypes });
    },

    // dump returns the full session cache: every RunType projected so far.
    dump() {
      return dispatch({ op: 'dump' });
    },

    // resolveId returns the canonical RunType for a single hash id.
    resolveId(id) {
      return dispatch({ op: 'resolveId', id });
    },

    // dumpType is the headline convenience: hand it a TypeScript type written
    // as a string and get back the resolved RunType graph for that type. It
    // wraps the type in a getRunTypeId<T>() call site, scans it, and returns
    // the scoped dump (the root id plus every node it references).
    dumpType(typeSource, { fileName = 'playground.ts' } = {}) {
      const source = [
        `import { getRunTypeId } from 'ts-runtypes';`,
        `type __RtPlaygroundType = ${typeSource};`,
        `getRunTypeId<__RtPlaygroundType>();`,
        ``,
      ].join('\n');

      this.setSources({ [fileName]: source });
      const scan = this.scanFiles([fileName], { includeRunTypes: true });

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
    },
  };
}

# ts-runtypes standalone playground

A standalone, client-side website that runs the **ts-runtypes resolver in the
browser** (compiled to WebAssembly) and **executes the generated functions
live**. Write a TypeScript type, pick a build function, and see it run against
your own input, no server round-trips, no build step in the loop.

It is a sibling of the Node POC in [`../`](../) (which only dumps the RunType
graph). This one resolves AND executes: `createValidate`, `createGetValidationErrors`,
the JSON / binary encoders + decoders, and the RunType graph view.

## How it works

1. The browser loads the resolver WASM + Go's `wasm_exec.js` shim and installs
   the synchronous `__tsRunTypesDispatch(requestJSON)` callback (same
   `protocol.Request` / `protocol.Response` wire shapes the native CLI speaks).
2. For the chosen function it dispatches `scanFiles` with `includeEntryModules`,
   getting back the emitted entry-module source for `<factory><MyType>()`.
3. [`public/core.mjs`](public/core.mjs) links those modules in-browser (deps
   ride lazy thunks, so concatenating the bindings into one scope is enough) and
   hands the resulting tuple to the matching **public ts-runtypes factory** to
   produce a live function, which it then runs against the input.

The whole pipeline is exactly what the Vite plugin + runtime do at build/run
time, here driven live from a single resolver dispatch. The editor is
[Monaco](https://microsoft.github.io/monaco-editor/) (a real dependency, served
locally from `node_modules` — no CDN).

## Run it

```bash
pnpm install          # installs monaco-editor
bash build.sh         # stages the WASM + runtime under public/ (needs the Go toolchain)
node server.mjs       # http://localhost:5174
```

`build.sh` output (`public/playground/`, `public/runtime/`) is git-ignored and
reproducible; only the source (`server.mjs`, `public/*.mjs`, `index.html`,
`styles.css`) is committed.

## Files

| File | Role |
|---|---|
| `public/index.html` | page shell + Monaco AMD bootstrap |
| `public/app.mjs` | UI: editors, function picker, result rendering |
| `public/core.mjs` | execution engine: marker overlay, operations, linker, `run()` |
| `public/wasm.mjs` | browser WASM loader (`__tsRunTypesDispatch`) |
| `server.mjs` | zero-dep static file server (serves `public/` + `/vs/` from monaco-editor) |
| `build.sh` | stages the WASM, Go shim, and the ts-runtypes runtime |

## Browser testing

Drive it with `playwright-cli` (see the `playwright-cli` skill). Point a config
at a chromium binary and open `http://localhost:5174`; the editors are reachable
via `monaco.editor.getEditors()` and the result lands in `#output`.

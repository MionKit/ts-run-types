# runtypes-playground

An **embeddable, in-browser ts-runtypes playground**. It loads the resolver
(compiled to WebAssembly) in the browser and **executes the generated functions
live** — `createValidate`, `createGetValidationErrors`, the JSON / binary
encoders + decoders, and a RunType graph view.

Two surfaces, so projects can integrate it however they like:

- **Headless engine** (`runtypes-playground/core`) — framework-agnostic, no UI.
- **Web component** (`<runtypes-playground>`) — drop-in custom element (light DOM).

> Private workspace package: consumed as source by the docs website and any
> in-repo host. Not published to npm.

## Web component

```ts
import 'runtypes-playground'; // registers <runtypes-playground>
```

```html
<runtypes-playground></runtypes-playground>
```

Attributes: `type` (initial snippet defining `MyType`), `input` (initial JSON),
`operation` (initial build function), `wasm-url` / `wasm-exec-url` (override
asset locations, e.g. a CDN).

It uses **light DOM** on purpose — Monaco measures layout and injects styles
into `document.head`, both of which shadow DOM breaks. For full TS language
features in the editor, configure `globalThis.MonacoEnvironment` (workers)
before the element connects (see `demo/main.ts`); otherwise editing still works
and the WASM resolver remains the source of truth for validation.

## Headless engine

```ts
import { run, OPERATIONS, versions } from 'runtypes-playground/core';

const result = await run('validate', 'type MyType = { id: number };', { id: 1 });
// { kind: 'predicate', value: true, ... }
```

`run(opKey, userCode, input?, options?)` resolves `<factory><MyType>()` via the
WASM resolver, links the emitted entry modules in-browser, and runs the live
function. `OPERATIONS` lists the available build functions.

## How it works

1. Load the resolver WASM + Go's `wasm_exec.js` shim (installs the synchronous
   `__tsRunTypesDispatch` callback).
2. Dispatch `scanFiles` with `includeEntryModules` for `<factory><MyType>()`.
3. Link the emitted entry-module source in-browser (deps ride lazy thunks, so
   concatenating the bindings into one scope is enough) and hand the tuple to
   the public `ts-runtypes` factory to get a live function.

No Go or protocol changes are involved — the resolver already returns runnable
entry modules. The same pipeline the Vite plugin + runtime use, driven live.

## Develop

```bash
pnpm install
pnpm --filter runtypes-playground run build:wasm   # stage assets/ (needs Go)
pnpm --filter runtypes-playground run demo          # Vite demo
pnpm --filter runtypes-playground run typecheck
```

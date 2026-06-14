# ts-runtypes WASM playground (POC)

Proof of concept: compile the Go/tsgo-backed **ts-runtypes resolver to WebAssembly**
and call it directly from Node.js (no native binary, no child process, no Unix
socket). Send a TypeScript type **as a string**, get back its **RunType dump**.

## What this proves

The native resolver (`cmd/ts-runtypes`) speaks newline-delimited JSON over stdio
and serves an in-memory tsgo `Program` + checker. This POC reuses the **exact
same resolver** (`internal/resolver`, `--inline-server` semantics) but swaps the
stdio transport for a single synchronous WASM callback:

```
globalThis.__tsRunTypesDispatch(requestJSON) -> responseJSON
```

`requestJSON` / `responseJSON` are the unchanged `protocol.Request` /
`protocol.Response` wire shapes — so every method below maps 1:1 to a CLI op.

The TypeScript lib files (`lib.d.ts`, …) come from tsgo's embedded `go:embed`
bundle, so the module needs **no disk access** for them; the only input is the
in-memory source overlay you inject via `setSources`. Output ids are byte-for-byte
identical to the native binary.

## Build

Prereqs are the same as the rest of the repo (see [`SETUP.md`](../SETUP.md)): Go ≥ 1.26
and the bootstrapped `tsgolint` submodule + patches.

```bash
./playground/build.sh
```

This produces three git-ignored, reproducible artifacts in `playground/`:
`ts-runtypes.wasm`, `wasm_exec.js` (Go's runtime shim), and `ts-runtypes.d.ts`
(the marker ambient declaration).

## Run

### CLI

```bash
node playground/cli.mjs '{ id: number; name: string; tags: string[]; active?: boolean }'
node playground/cli.mjs --root-only 'string | number | boolean'
```

### HTTP API + browser playground

```bash
node playground/server.mjs       # http://localhost:8787
```

- `GET  /` — interactive page (type a type, see the dump; ⌘/Ctrl+Enter to run).
- `POST /api/dump-type` — `{ "type": "<ts type>" }` → RunType dump.
- `POST /api/dispatch` — raw `{ "op": "...", ... }` protocol request.

```bash
curl -s -X POST localhost:8787/api/dump-type \
  -H 'content-type: application/json' \
  -d '{"type":"{ id: number; email: string }"}'
```

## Programmatic API

```js
import { loadResolver } from './playground/runtypes-wasm.mjs';

const rt = await loadResolver();

// Headline convenience: type string -> resolved RunType graph.
const { rootId, root, runTypes } = rt.dumpType('{ id: number; name: string }');

// Or drive the raw ops, exactly like the CLI:
rt.setSources({ 'index.ts': "import { getRunTypeId } from 'ts-runtypes'; getRunTypeId<{x:1}>();" });
rt.scanFiles(['index.ts'], { includeRunTypes: true });
rt.dump();
rt.resolveId('BP5HhTR');
```

## Files

| File                 | Purpose                                                      |
| -------------------- | ----------------------------------------------------------- |
| `runtypes-wasm.mjs`  | WASM loader + the small op-mapping API (`dumpType`, …).      |
| `cli.mjs`            | Command-line front end (`type string` → dump).              |
| `server.mjs`         | Zero-dep HTTP API + single-file browser playground.         |
| `build.sh`           | Compiles the WASM and stages the runtime files.             |
| `../cmd/ts-runtypes-wasm/main.go` | The `js,wasm` entry point exposing the dispatch callback. |

## Status & next steps

This is a POC. Known follow-ups if it graduates:

- **Browser-native**: today `server.mjs` runs the WASM under Node and exposes
  HTTP. The same `.wasm` + `wasm_exec.js` can run fully in-browser (instantiate
  client-side, drop the server) — the resolver already needs no disk.
- **Module resolution probing**: `import 'ts-runtypes'` is satisfied by the
  ambient `.d.ts`; a real package would need its node_modules served into the
  overlay or virtualized.
- **Size**: ~38 MB uncompressed (~8–9 MB gzipped). Acceptable for a server-side
  POC; a browser build would want streaming instantiation + compression, and
  possibly `tinygo` / dead-code trimming.

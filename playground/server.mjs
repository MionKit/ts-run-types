// server.mjs — a small HTTP API in front of the WASM resolver.
//
// Loads the ts-runtypes WASM module once at startup, then exposes the same
// resolver ops over HTTP so a browser (or curl) can drive it the same way the
// CLI passes params:
//
//   GET  /                  -> interactive playground page
//   POST /api/dump-type     { "type": "<ts type>" }            -> RunType dump
//   POST /api/dispatch      { "op": "...", ... }               -> raw protocol response
//
// Zero npm dependencies — Node's built-in http module only.
//
//   node server.mjs            # listens on http://localhost:8787
//   PORT=9000 node server.mjs

import { createServer } from 'node:http';
import { loadResolver } from './runtypes-wasm.mjs';

const port = Number(process.env.PORT ?? 8787);

const rt = await loadResolver();
console.log(`ts-runtypes wasm loaded (version ${rt.versions.version}, tsgo ${rt.versions.tsgo})`);

function sendJSON(res, status, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }

    if (req.method === 'POST' && req.url === '/api/dump-type') {
      const { type } = JSON.parse((await readBody(req)) || '{}');
      if (typeof type !== 'string' || !type.trim()) {
        return sendJSON(res, 400, { error: 'body must be { "type": "<typescript type>" }' });
      }
      // dumpType resets sources per request, so each call is independent.
      const result = rt.dumpType(type);
      return sendJSON(res, 200, result);
    }

    if (req.method === 'POST' && req.url === '/api/dispatch') {
      const request = JSON.parse((await readBody(req)) || '{}');
      const response = rt.dispatch(request);
      return sendJSON(res, 200, response);
    }

    sendJSON(res, 404, { error: 'not found' });
  } catch (err) {
    sendJSON(res, 500, { error: String(err?.message ?? err) });
  }
});

server.listen(port, () => {
  console.log(`playground API on http://localhost:${port}`);
});

// Minimal single-file playground page. It POSTs the type string to the API and
// renders the returned RunType dump — the Go/tsgo compiler runs server-side in
// WASM, no native binary spawned.
const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ts-runtypes WASM playground</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: #0d1117; color: #c9d1d9; }
  header { padding: 14px 18px; border-bottom: 1px solid #21262d; }
  header h1 { margin: 0; font-size: 15px; }
  header small { color: #8b949e; }
  main { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #21262d; height: calc(100vh - 56px); }
  section { background: #0d1117; display: flex; flex-direction: column; min-width: 0; }
  .label { padding: 8px 14px; color: #8b949e; border-bottom: 1px solid #21262d; }
  textarea { flex: 1; border: 0; resize: none; padding: 14px; background: #0d1117; color: #c9d1d9; font: inherit; outline: none; }
  pre { flex: 1; margin: 0; padding: 14px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .bar { padding: 10px 14px; border-top: 1px solid #21262d; display: flex; gap: 10px; align-items: center; }
  button { background: #238636; color: #fff; border: 0; padding: 7px 16px; border-radius: 6px; cursor: pointer; font: inherit; }
  button:disabled { opacity: .5; cursor: default; }
  .meta { color: #8b949e; }
</style>
</head>
<body>
<header><h1>ts-runtypes WASM playground</h1> <small>type a TypeScript type, get its RunType dump — compiler runs in WebAssembly</small></header>
<main>
  <section>
    <div class="label">TypeScript type</div>
    <textarea id="input">{ id: number; name: string; tags: string[]; active?: boolean }</textarea>
    <div class="bar"><button id="run">Dump type</button><span id="status" class="meta"></span></div>
  </section>
  <section>
    <div class="label">RunType dump</div>
    <pre id="output">press “Dump type”…</pre>
  </section>
</main>
<script>
  const input = document.getElementById('input');
  const output = document.getElementById('output');
  const status = document.getElementById('status');
  const button = document.getElementById('run');
  async function run() {
    button.disabled = true; status.textContent = 'resolving…';
    const started = performance.now();
    try {
      const res = await fetch('/api/dump-type', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: input.value }),
      });
      const data = await res.json();
      output.textContent = JSON.stringify(data, null, 2);
      const ms = Math.round(performance.now() - started);
      status.textContent = data.error ? 'error' : (data.runTypes?.length ?? 0) + ' nodes · ' + ms + 'ms';
    } catch (err) {
      output.textContent = String(err); status.textContent = 'error';
    } finally {
      button.disabled = false;
    }
  }
  button.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); });
  run();
</script>
</body>
</html>`;

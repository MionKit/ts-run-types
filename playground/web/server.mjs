// server.mjs — a zero-dependency static file server for the standalone
// ts-runtypes playground site.
//
// The playground is a pure client-side SPA: the browser loads the WASM
// resolver, Go's wasm_exec.js shim, and the ts-runtypes runtime directly, then
// resolves + executes generated functions in-page. This server only hands out
// the static files under public/ with the right MIME types (application/wasm
// matters for streaming instantiation), so the same tree can later be dropped
// onto any static host.
//
//   node server.mjs            # http://localhost:5174
//   PORT=8080 node server.mjs
//
// Run playground/web/build.sh first to stage the WASM + runtime under public/.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(here, 'public');
// Monaco's prebuilt AMD bundle, served as-is at /vs/ (no bundler needed).
const monacoVsDir = join(here, 'node_modules', 'monaco-editor', 'min', 'vs');
const port = Number(process.env.PORT ?? 5174);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  // Strip query/hash, decode, and contain the path inside its root dir.
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = normalize(clean)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');

  // /vs/* maps into the installed monaco-editor package.
  if (rel === 'vs' || rel.startsWith(`vs${'/'}`) || rel.startsWith('vs\\')) {
    const target = join(monacoVsDir, rel.slice('vs'.length));
    if (!target.startsWith(monacoVsDir)) return null;
    try {
      await stat(target);
      return target;
    } catch {
      return null;
    }
  }

  let target = join(publicDir, rel);
  if (!target.startsWith(publicDir)) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) target = join(target, 'index.html');
    return target;
  } catch {
    return null;
  }
}

const httpServer = createServer(async (req, res) => {
  const target = await resolveFile(req.url === '/' ? '/index.html' : req.url);
  if (!target) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      // The site is content-addressed-ish; keep it simple for local dev.
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

httpServer.listen(port, () => {
  console.log(`ts-runtypes playground -> http://localhost:${port}`);
});

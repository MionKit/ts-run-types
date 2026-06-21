// cli.mjs — minimal command-line front end over the WASM resolver.
//
// Usage:
//   node cli.mjs '{ id: number; name: string; tags: string[] }'
//   node cli.mjs --root-only 'string | number'
//
// Sends the type string into the WASM resolver and prints the returned
// RunType dump as JSON — the POC success criterion.

import { loadResolver } from './runtypes-wasm.mjs';

const args = process.argv.slice(2);
const rootOnly = args.includes('--root-only');
const typeSource = args.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!typeSource) {
  console.error("usage: node cli.mjs [--root-only] '<typescript type>'");
  process.exit(2);
}

const rt = await loadResolver();
console.error(`loaded ts-runtypes wasm (version ${rt.versions.version}, tsgo ${rt.versions.tsgo})`);

const result = rt.dumpType(typeSource);

if (rootOnly) {
  console.log(JSON.stringify({ rootId: result.rootId, root: result.root }, null, 2));
} else {
  console.log(
    JSON.stringify(
      { rootId: result.rootId, nodeCount: result.runTypes.length, runTypes: result.runTypes },
      null,
      2,
    ),
  );
}

if (result.diagnostics.length > 0) {
  console.error(`diagnostics: ${result.diagnostics.length}`);
}

process.exit(0);

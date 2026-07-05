// Writes the ts-runtypes source overlay JSON the browser playground fetches at
// runtime (/playground-app/runtypes-sources.json). Thin CLI over the shared
// builder so container/website/scripts/build-playground.sh can emit it without
// inlining the walk. Usage:
//   node scripts/gen-runtypes-sources.mjs <srcDir> <outFile>
import {writeFileSync} from 'node:fs';
import {buildRuntypesOverlay} from './runtypes-source-overlay.mjs';

const [srcDir, outFile] = process.argv.slice(2);
if (!srcDir || !outFile) {
  console.error('usage: node scripts/gen-runtypes-sources.mjs <srcDir> <outFile>');
  process.exit(2);
}

writeFileSync(outFile, JSON.stringify(buildRuntypesOverlay(srcDir)));
console.error(`==> wrote ts-runtypes source overlay -> ${outFile}`);

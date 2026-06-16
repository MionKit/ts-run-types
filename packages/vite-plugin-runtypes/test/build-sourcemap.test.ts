// End-to-end proof that the rewrite's source map survives Vite's composite
// map chain (our EditBuffer map -> esbuild's TS transform -> Rollup
// bundling): in a real `vite build` with sourcemaps on, the emitted chunk
// must map each marker call site back to its ORIGINAL fixture line — i.e.
// the injected single-line import block and the spliced bindings displace
// nothing in the debugger's view. The fixture deliberately carries a
// multibyte em-dash before the call sites so byte->char conversion is
// exercised through the full pipeline, not just in the rewrite unit tests.

import {describe, expect, it} from 'vitest';
import {build, type Rollup} from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import runtypes from '../src/index.ts';
import {BIN, hasBinary} from './helpers/inline.ts';
import {decodeMappings, type MappingSegment} from './helpers/sourcemap.ts';

const PACKAGE_ROOT = path.resolve(__dirname, '../../ts-runtypes');
// Lives under the marker package's test/ tree so tsconfig.test.json puts the
// fixture in the Go resolver's Program (the plugin scans real program files).
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-build-sourcemap');

const FIXTURE = `import {getRunTypeId} from 'ts-runtypes';
// padding line with a multibyte em-dash — keeps byte/char conversion honest
export interface MapThing {
  mapProp: string;
}
export const staticId = getRunTypeId<MapThing>();
const sample = {mapProp: 'x'} as MapThing;
export const reflectedId = getRunTypeId(sample);
`;

describe('vite build / composite source map', () => {
  const register = hasBinary() ? it : it.skip;

  // One real build shared by both form assertions (the build is the slow
  // part; the paired tests decode the same chunk map).
  let buildOnce: Promise<{chunk: Rollup.OutputChunk; mappedLines: MappingSegment[][]; fixtureSourceIndex: number}> | null = null;
  const builtChunk = () => (buildOnce ??= runBuild());

  async function runBuild() {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'entry-map.ts'), FIXTURE);
    try {
      const result = (await build({
        root: PACKAGE_ROOT,
        logLevel: 'error',
        resolve: {conditions: ['source']},
        plugins: [
          runtypes({
            binary: BIN,
            cwd: PACKAGE_ROOT,
            tsconfig: 'tsconfig.test.json',
            cacheDir: false,
          }) as never,
        ],
        build: {
          write: false,
          minify: false,
          sourcemap: true,
          rollupOptions: {
            input: {map: path.join(FIXTURE_DIR, 'entry-map.ts')},
          },
        },
      })) as Rollup.RollupOutput;

      const chunk = result.output.find((o): o is Rollup.OutputChunk => o.type === 'chunk' && o.isEntry);
      if (!chunk) throw new Error('no entry chunk emitted');
      if (!chunk.map) throw new Error('entry chunk carries no source map');
      // The chunk bundles the fixture together with the marker runtime and
      // the virtual entry modules — locate the fixture among the sources by
      // its content (path spelling differs across Vite versions).
      const fixtureSourceIndex = (chunk.map.sourcesContent ?? []).findIndex((content) => content === FIXTURE);
      if (fixtureSourceIndex < 0) throw new Error('fixture source missing from chunk map sourcesContent');
      return {chunk, mappedLines: decodeMappings(chunk.map.mappings), fixtureSourceIndex};
    } finally {
      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    }
  }

  // expectMappedToOriginalLine asserts the composite map carries the marker
  // call back to the fixture line that wrote it. Vite app builds run Rollup
  // with `preserveEntrySignatures: false`, so the entry's exported NAMES are
  // dropped and only the side-effectful marker calls survive — the assertion
  // therefore keys on the surviving call expression (`generatedToken`).
  // Several generated lines can contain that token (the marker package's own
  // function definition bundles into the same chunk), so the match requires
  // a segment pointing at the FIXTURE source index AND the expected line —
  // definition/diagnostic lines map to other sources and can't false-hit.
  function expectMappedToOriginalLine(
    built: {chunk: Rollup.OutputChunk; mappedLines: MappingSegment[][]; fixtureSourceIndex: number},
    generatedToken: string,
    originalToken: string
  ) {
    const originalLine = FIXTURE.split('\n').findIndex((line) => line.includes(originalToken));
    expect(originalLine).toBeGreaterThanOrEqual(0);
    const generatedLines = built.chunk.code.split('\n');
    const candidates: number[] = [];
    for (let line = 0; line < generatedLines.length; line++) {
      if (generatedLines[line].includes(generatedToken)) candidates.push(line);
    }
    expect(candidates.length).toBeGreaterThan(0);
    const mapped = candidates.some((line) =>
      (built.mappedLines[line] ?? []).some(
        (segment) => segment.sourceIndex === built.fixtureSourceIndex && segment.originalLine === originalLine
      )
    );
    expect(mapped).toBe(true);
  }

  register(
    'static form: getRunTypeId<T>() site maps back to its original line',
    async () => {
      expectMappedToOriginalLine(await builtChunk(), 'getRunTypeId(', 'getRunTypeId<MapThing>');
    },
    120_000
  );

  register(
    'reflection form: getRunTypeId(value) site maps back to its original line',
    async () => {
      expectMappedToOriginalLine(await builtChunk(), 'getRunTypeId(sample', 'getRunTypeId(sample)');
    },
    120_000
  );
});

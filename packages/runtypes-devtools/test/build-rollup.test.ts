// Cross-bundler proof for the runtypes-devtools/rollup entry. Rather than a
// full rollup() bundle — which would need a TypeScript-stripping plugin plus
// node-resolution and makes the resolver's cold-start timing flaky in such a
// tight harness — this drives the unplugin-generated Rollup plugin's hooks
// exactly as Rollup invokes them (buildStart, transform, resolveId, load) and
// asserts the whole chain: the marker call is rewritten with an injected
// virtual:rt import, that specifier resolves to a tagged id, and loading it
// yields the validator generated from the type. Proof that the /rollup entry
// produces a working Rollup plugin off the shared unplugin factory. The /vite
// entry's full real-build coverage lives in build-split + build-sourcemap.
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import runtypesRollup from '../src/rollup.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

// Lives under the marker package's test/ tree so tsconfig.test.json puts the
// fixture in the Go resolver's Program (the plugin scans real program files).
const PACKAGE_ROOT = path.resolve(__dirname, '../../ts-runtypes');
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-build-rollup');
const ENTRY = path.join(FIXTURE_DIR, 'entry.ts');

const FIXTURE = `import {createValidate} from 'ts-runtypes';
interface RollupThing {
  rollupProp: string;
}
export const isThing = createValidate<RollupThing>();
`;

// unplugin emits each Rollup hook as either a plain function or a { handler }
// object; invoke either form with a Rollup-like plugin context.
type Hook = ((...args: unknown[]) => unknown) | {handler: (...args: unknown[]) => unknown};
const callHook = (hook: Hook, thisArg: unknown, ...args: unknown[]): unknown =>
  typeof hook === 'function' ? hook.apply(thisArg, args) : hook.handler.apply(thisArg, args);

describe('rollup build / runtypes-devtools/rollup entry', () => {
  const register = hasBinary() ? it : it.skip;

  register(
    'produces a Rollup plugin whose hooks rewrite markers + serve the validator',
    async () => {
      const plugin = runtypesRollup({binary: BIN, cwd: PACKAGE_ROOT, tsconfig: 'tsconfig.test.json', cacheDir: false}) as any;
      expect(plugin.name).toBe('runtypes-devtools');

      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      fs.mkdirSync(FIXTURE_DIR, {recursive: true});
      fs.writeFileSync(ENTRY, FIXTURE);
      const ctx = {
        error(message: string): never {
          throw new Error(message);
        },
        warn(): void {},
      };
      try {
        await callHook(plugin.buildStart, ctx);

        // transform: the marker call is rewritten to the entry-binding form
        // and a virtual:rt import is injected (the same rewrite /vite performs).
        const transformed = (await callHook(plugin.transform, ctx, FIXTURE, ENTRY)) as {code: string} | null;
        expect(transformed).toBeTruthy();
        const code = transformed!.code;
        const match = code.match(/from '(virtual:rt\/[^']+\.js)'/);
        expect(match, `expected an injected virtual:rt import in:\n${code}`).toBeTruthy();
        const specifier = match![1];

        // resolveId tags the virtual specifier; load serves its module body.
        const resolved = (await callHook(plugin.resolveId, ctx, specifier)) as string | {id: string};
        const resolvedId = typeof resolved === 'string' ? resolved : resolved.id;
        expect(resolvedId).toContain('virtual:rt/');

        const loaded = (await callHook(plugin.load, ctx, resolvedId)) as string | {code: string};
        const loadedCode = typeof loaded === 'string' ? loaded : loaded.code;
        // The generated validator references the type's property — proof the
        // rollup entry's load() serves the real, type-derived module.
        expect(loadedCode).toContain('rollupProp');
      } finally {
        try {
          await callHook(plugin.buildEnd, ctx);
        } catch {
          // best-effort teardown
        }
        fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
      }
    },
    120_000
  );
});

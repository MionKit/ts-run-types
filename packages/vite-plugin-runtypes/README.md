# vite-plugin-runtypes

Vite plugin that rewrites **RunTypes** marker calls (`getTypeInfo`, `validate`, `router`) into cache lookups, driven by the [RunTypes](../../README.md) Go resolver.

## Install

```bash
pnpm add -D vite-plugin-runtypes
```

You must also build the `ts-runtypes` binary from the parent repo and pass its path to the plugin.

## Usage

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import runtypes from 'vite-plugin-runtypes';

export default defineConfig({
  plugins: [
    runtypes({
      binary: './bin/ts-runtypes', // built from the parent Go module
      tsconfig: 'tsconfig.json',
    }),
  ],
});
```

In your app:

```ts
import * as cache from 'virtual:runtypes-cache';
import {RUNTYPES_VAR_PREFIX} from 'vite-plugin-runtypes';

function getTypeInfo<T>(value: T, siteId?: string) {
  return siteId ? cache[RUNTYPES_VAR_PREFIX + siteId] : undefined;
}

const name: string = 'mario';
const info = getTypeInfo(name); // at build time, plugin injects the site id
```

The cache module is a flat list of `export const t_<hash> = {…}` declarations. A future transformer pass can rewrite the lookup above into a direct named import (`import {t_<hash>} from 'virtual:runtypes-cache'`) so bundlers can tree-shake unused entries.

## Options

| Option            | Default                           | Description                                                                |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `binary`          | — (required)                      | Path to the compiled `ts-runtypes` Go binary.                              |
| `cwd`             | Vite's root                       | Project root used to resolve `tsconfig` and source paths                   |
| `tsconfig`        | `"tsconfig.json"`                 | tsconfig, relative to `cwd`.                                               |
| `markers`         | `[getTypeInfo, validate, router]` | Marker functions to rewrite.                                               |
| `virtualModuleId` | `"virtual:runtypes-cache"`        | Virtual module id exposing one `export const t_<hash>` per cached RunType. |

## Status

Experimental. The regex-based call-site scanner is intentionally minimal; a production build would use a real parser.

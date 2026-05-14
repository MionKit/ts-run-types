# vite-plugin-runtypes

Vite plugin that rewrites **mion runtypes** marker calls (`getTypeInfo`, `isType`, `router`) into cache lookups, driven by the [`ts-go-run-types`](../../README.md) Go resolver.

## Install

```bash
pnpm add -D vite-plugin-runtypes
```

You must also build the `ts-go-run-types` binary from the parent repo and pass its path to the plugin.

## Usage

```ts
// vite.config.ts
import {defineConfig} from 'vite';
import runtypes from 'vite-plugin-runtypes';

export default defineConfig({
  plugins: [
    runtypes({
      binary: './bin/ts-go-run-types', // built from the parent Go module
      tsconfig: 'tsconfig.json',
    }),
  ],
});
```

In your app:

```ts
import {__runtypes} from 'virtual:runtypes-cache';

function getTypeInfo<T>(value: T, siteId?: string) {
  return siteId ? __runtypes.get(siteId) : undefined;
}

const name: string = 'mario';
const info = getTypeInfo(name); // at build time, plugin injects the site id
```

## Options

| Option            | Default                         | Description                                              |
| ----------------- | ------------------------------- | -------------------------------------------------------- |
| `binary`          | — (required)                    | Path to the compiled `ts-go-run-types` Go binary.        |
| `cwd`             | Vite's root                     | Project root used to resolve `tsconfig` and source paths |
| `tsconfig`        | `"tsconfig.json"`               | tsconfig, relative to `cwd`.                             |
| `markers`         | `[getTypeInfo, isType, router]` | Marker functions to rewrite.                             |
| `virtualModuleId` | `"virtual:runtypes-cache"`      | Virtual module id exposing `__runtypes` Map + `__sites`. |

## Status

Experimental. The regex-based call-site scanner is intentionally minimal; a production build would use a real parser.

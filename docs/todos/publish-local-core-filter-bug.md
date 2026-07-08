# Local publish skips `@ts-runtypes/core` (stale `--filter` after the scope rename)

**Status:** todo (bug; found 2026-07-08)
**Severity:** high — the local publish path silently omits the main package.
**Scope:** [`scripts/release/publish.mjs`](../../scripts/release/publish.mjs) (one line). No CI/runtime code.

## The bug

[`scripts/release/publish.mjs:73`](../../scripts/release/publish.mjs) publishes the FE
packages with:

```js
runOrThrow('pnpm', ['--filter', 'ts-runtypes', '--filter', '@ts-runtypes/devtools', 'publish', …]);
```

The `--filter ts-runtypes` selector is stale: after the scope rename the package
is named **`@ts-runtypes/core`** (the *directory* is still `packages/ts-runtypes`,
but pnpm `--filter <bare-name>` matches the package **name**, not the directory).
So the filter matches nothing and pnpm publishes **only** `@ts-runtypes/devtools`,
silently skipping `@ts-runtypes/core`.

### Evidence

```
$ pnpm --filter ts-runtypes exec node -e "console.log(require('./package.json').name)"
No projects matched the filters in "…/ts-run-types"

$ pnpm --filter @ts-runtypes/core exec node -e "console.log(require('./package.json').name)"
@ts-runtypes/core
```

pnpm exits 0 when a filter matches nothing, so the omission is **silent** — the
local publish "succeeds" while `@ts-runtypes/core` never reaches the registry.

## Blast radius

- **Local publish (`pnpm rtx release npm` → `publish.mjs`): BROKEN** — `@ts-runtypes/core` is never published.
- **CI staged publish: NOT affected** — [`pack.mjs`](../../scripts/release/pack.mjs) packs the FE packages by `cd`-ing into each dir (`FE_PACKAGE_DIRS = ['ts-runtypes', 'ts-runtypes-devtools']`) and running `pnpm pack` there, so `@ts-runtypes/core` is packed; [`publish-tarballs.mjs`](../../scripts/release/publish-tarballs.mjs) then stages every tarball in `tarballs/`.

This is on the critical path for the **first** release: OIDC/trusted publishing
cannot create a package that does not exist yet, so the initial version of every
`@ts-runtypes/*` package must be published with a token — and the local path is
exactly that bootstrap. With this bug, the bootstrap omits the main package.

## Fix

Change the stale selector to the package name (or filter by directory):

```js
runOrThrow('pnpm', ['--filter', '@ts-runtypes/core', '--filter', '@ts-runtypes/devtools', 'publish', …]);
```

Then verify `pnpm --filter @ts-runtypes/core --filter @ts-runtypes/devtools publish --dry-run`
lists both packages. Consider a guard that fails if fewer than the expected number
of FE packages are selected, so a future rename can't silently skip one again.

## Related

Part of the scope-rename cleanup ([scope-rename-followups.md](./scope-rename-followups.md)),
but tracked separately because it is a functional publish bug, not cosmetics.

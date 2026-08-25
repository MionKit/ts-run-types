# RunTypes (archived)

> [!IMPORTANT]
> **This repository is archived and no longer maintained.**
>
> RunTypes now lives in the mion repository: **https://github.com/MionKit/mion**
>
> The full history of this repo was merged there. All development, issues, and
> pull requests happen in that repo from now on. Nothing here is updated any more.

**Compile-time runtime types for TypeScript 7 / typescript-go (tsgo).**

TypeScript throws your types away before your code ever runs. RunTypes reads them
first, at build time, and hands the runtime back what it lost: validators, JSON and
binary (de)serializers, mock data, and reflection.

## Where things moved

| What | Where it is now |
| ---- | --------------- |
| Source code | [MionKit/mion](https://github.com/MionKit/mion), under `packages/ts-runtypes*` and `ts-go-runtypes/` |
| Issues and pull requests | [MionKit/mion/issues](https://github.com/MionKit/mion/issues) |
| Documentation | [runtypes.pages.dev](https://runtypes.pages.dev/) (unchanged) |
| npm packages | `@ts-runtypes/*` (unchanged, now published from the mion repo) |

The npm packages keep their names, so nothing changes for anyone installing them.

## Use

```bash
pnpm add @ts-runtypes/core
pnpm add -D @ts-runtypes/devtools
```

Full guides, API reference, and benchmarks live at
**[runtypes.pages.dev](https://runtypes.pages.dev/)**.

## License

Proprietary, all rights reserved. No use, copying, or distribution without prior
written authorization. See [LICENSE](./LICENSE).

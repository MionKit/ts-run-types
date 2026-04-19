# examples

Runnable fixtures that demonstrate what `ts-run-types` extracts from real TypeScript source. Each folder contains an `input.ts`; run the CLI against it to produce a type-metadata JSON cache.

Prerequisite: a `tsconfig.json` at the example root (see `examples/tsconfig.json`). The CLI uses it to bootstrap the Program; the actual compiler options don't matter beyond `strict`, `moduleResolution` and targeting TS.

## 01 — annotation (`isType<User>` and `getTypeInfo(u: User)`)

```bash
../../bin/ts-run-types --one-shot --tsconfig tsconfig.json --cwd $PWD <<EOF
{"op":"resolveTypeArgument","file":"01-annotation/input.ts","callPos":140,"index":0}
{"op":"resolveArgumentInferred","file":"01-annotation/input.ts","callPos":162,"index":0}
{"op":"dump"}
EOF
```

Expected dump (abbreviated):

```json
{
  "types": [
    {"id":"t0","kind":"object","alias":"User","properties":{"id":{"type":"t1"},"name":{"type":"t2"}}},
    {"id":"t1","kind":"primitive","name":"number"},
    {"id":"t2","kind":"primitive","name":"string"}
  ]
}
```

## 02 — inference of a factory return

```bash
../../bin/ts-run-types --one-shot --tsconfig tsconfig.json --cwd $PWD <<EOF
{"op":"resolveArgumentInferred","file":"02-inference-argument/input.ts","callPos":140,"index":0}
{"op":"dump"}
EOF
```

The resolver infers the anonymous object shape `{id: number; name: string}` returned by `makeUser`.

## 03 — `router(routes)` inference

```bash
../../bin/ts-run-types --one-shot --tsconfig tsconfig.json --cwd $PWD <<EOF
{"op":"resolveArgumentInferred","file":"03-inference-router/input.ts","callPos":190,"index":0}
{"op":"dump"}
EOF
```

Produces the nested projection: the object containing each route as a function type with its params + return fully resolved, without any explicit type annotation on `routes`.

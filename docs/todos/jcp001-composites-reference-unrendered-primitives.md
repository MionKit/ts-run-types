# JCP001: JSON composites reference primitive entries that were never rendered (marker test program, ×18)

## Evidence (exposed 2026-07-13 while making Error diagnostics halt every lane)

The failOnError work made `buildStart` surface ALL diagnostic families (previously only
`Family.PureFn` was forwarded, everything else was silently dropped). That immediately
exposed 18 pre-existing Error-severity internal diagnostics in the marker package's OWN
test program (`packages/ts-runtypes`, tsconfig.test.json):

```
error JCP001: Internal error: JSON composite `cO2_GyO4sYa` references primitive entry
`Hpn_GyO4sYa` which was never rendered — please file an issue.
```

- Raised at [ts-go-runtypes/internal/cachegen/typefunctions/json_composite.go:418]
  (`CodeCompositeMissingPrimitive`) when a composite's primitive binding key is absent
  from the rendered entry set.
- 18 occurrences, distinct type ids (GyO4sYa, IAkGWaa, Kc2Eo6E, UGk8oAm, YWssAiO,
  ZpLXDbP, hJNtdND, nFTNX5d, v9vvB31, …), stable across runs.
- **Pre-existing on `main`**: bisected by rebuilding `bin/ts-runtypes` from origin/main
  (with the failOnError branch's Go changes reverted) and re-running a direct
  `generate()` probe over the same program — identical 18 JCP001s. Not caused by the
  class-serializer emit change or the diskcache format bump riding the same branch.
- The diagnostic carries an EMPTY site (`filePath: "", 0,0`), so nothing points the user
  at the offending type — the args are runtime cache keys, not source locations.

## Why it matters

- A composite that references an unrendered primitive binds `utl.getRT(key).fn` against
  a key that never registers — the emitted encoder/decoder for that type would throw at
  runtime if that path is exercised.
- The marker package's own suite is green, so either the affected composites are never
  materialized by any test (dead cache entries), or the bindings elide before use —
  both worth understanding before trusting composites on real programs.
- It is Error severity: any consumer program that trips the same rendering gap under
  the new strict default (failOnError: true) fails their build on an internal error
  they cannot act on.

## Fix directions

- Reproduce minimally: bisect the marker test program (the affected ids repeat across
  runs) down to the type shape whose composite loses its primitive — suspicion: a
  demand/elision interaction where the primitive entry is dropped (noop-elided or
  demand-closed away) while the composite's binding list still references it.
- Make JCP001 carry the type's structural id / a source site so it's actionable.
- Add the reduced shape to the Go corpus + an FE regression once fixed.

## Interim

The marker package's vitest config runs with `failOnError: false` (needed anyway for its
deliberate alwaysThrow suites), so these surface as warnings there, not halts.

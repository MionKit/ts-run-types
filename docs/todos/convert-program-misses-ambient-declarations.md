---
type: fix
spec: guidelines
status: ready
created: 2026-08-09
---

# `convert` builds a program without the project's ambient declarations

## Problem

`convert` resolves types against a program whose ROOTS are only the files named
on the command line. Any declaration the project supplies through a `.d.ts` that
nothing imports is therefore invisible, the checker answers `any`, and the
converter writes that `any` into the user's source. Exit code 0, no diagnostic.

    // src/ambient.d.ts  (in the tsconfig's include, imported by nothing)
    declare interface Ambient {a: string; b: number}

    // src/main.ts
    export type UsesAmbient = {value: Ambient};

    $ ts-runtypes convert --to builders src/main.ts
    export const usesAmbientRT = RT.object({value: RT.any()});
    export type UsesAmbient = InferType<typeof usesAmbientRT>;

The same project resolves `Ambient` correctly under `ts-runtypes compile`, which
goes through `program.New` (config-driven, full include set), so this is not the
resolver disagreeing with tsc — it is convert building a smaller program than
the project.

That is the exact failure CNV007 exists to prevent for Temporal: "converting now
would replace the type with any". Temporal is guarded by name; everything else
is not.

### It compounds across declarations

The damage is worse than one `any` per declaration. Types that resolve to `any`
become structurally identical to each other, so the reference machinery treats
them as the same type and collapses them onto a name reference to whichever it
saw first:

    // src/ambient.d.ts  (imported by nothing)
    declare interface Alpha {a: string}
    declare interface Beta {b: number}
    declare interface Gamma {c: boolean}

    // src/main.ts
    export type UsesAlpha = {value: Alpha};
    export type UsesBeta = {value: Beta};
    export type UsesGamma = {value: Gamma};

    $ ts-runtypes convert --to builders src/main.ts
    export const usesAlphaRT = RT.object({value: RT.any()});
    export type UsesAlpha = InferType<typeof usesAlphaRT>;
    export const usesBetaRT = getRunType<UsesAlpha>();     // <- not Beta
    export type UsesBeta = InferType<typeof usesBetaRT>;
    export const usesGammaRT = getRunType<UsesAlpha>();    // <- not Gamma
    export type UsesGamma = InferType<typeof usesGammaRT>;

Three unrelated types are now two aliases of a third, written into the user's
source, exit code 0. Both targets do it (`--to json-schema` emits
`embedType<UsesAlpha>()` for all three), so it is in the shared reference
machinery, not a target quirk. Note what this costs beyond correctness: fixing
the `.d.ts` visibility later does NOT recover `UsesBeta`, because the file no
longer mentions `Beta` at all.

The collapse is not a separate defect to chase; it is the same root cause
observed one level up. It does raise the priority of piece 2 below, which is
what stops any of this from reaching disk.

## Cause

`cmd/ts-runtypes/convert_cli.go` calls `program.NewInferred(…, absFiles)`, whose
contract is explicit (`compiler/program/program.go`): "the roots are exactly the
caller-supplied fileNames, never the tsconfig's own include set". The parsed
config it threads through (`program.InferredConfig`) carries `CompilerOptions`
only — it does not carry the file list, so convert has nothing to widen the
roots with even if it wanted to.

`enrich` takes the same constructor, and so does the DAEMON path the Vite plugin
runs on (overlay buffers). Whether those two share the hole, and whether an
ambient-declaring project silently degrades in the plugin as well, has NOT been
checked and is the first thing to establish.

## Fix direction

Two independent pieces, both worth doing:

1. **Give the inferred program the project's files as extra roots.** Extend
   `InferredConfig` to carry the parsed file list and pass `fileNames ∪
   project files` as roots. The conversion SET stays the CLI's file list, so
   `BuildSet` / CNV004 semantics do not move — only what the checker can see.
   Measure the cost first: a one-file convert would start parsing the whole
   project, which is why the daemon chose narrow roots to begin with. Loading
   only the `.d.ts` members of the include set may be the right middle ground.
2. **Refuse instead of baking in `any`.** Generalise `temporalAnyDiags`
   (`internal/convert/set.go`) from "a `Temporal.*` reference that resolved to
   any" to "a written type reference that resolved to the ERROR type" — an
   unresolved name, which is what an invisible ambient produces. A genuine
   `type Any = any` alias resolves to the any type, not the error type, so the
   two are distinguishable and the guard does not fire on real `any`. This is
   the safety net that keeps a silent identity change impossible even if the
   program is incomplete for a reason nobody predicted.

## Done when

A project whose types come from an ambient `.d.ts` converts them faithfully, a
declaration whose type cannot be resolved refuses with a diagnostic instead of
converting to `any`, and there is a test for each — the refusal test using the
three-declaration case above, so the collapse is pinned as refused rather than
merely unlikely. The daemon / enrich question above is answered in writing —
either "they share the hole, fixed here too" or "they do not, because …".

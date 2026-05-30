// `TypeFromRT<RT>` — recovers the source TS type a `RunType<T>` represents.
// This is the value-first system's "infer" (Zod-style), but it is NOT named
// `Infer` and uses NO `infer` keyword: it reads the phantom `__rtType` carrier
// by indexed access, the same `extends`-guard + indexed-access idiom the
// codebase already uses (e.g. `FieldConfigOf` / `ParamsOf` in define.ts).
//
//   const Name = string({maxLength: 50});   // RunType<FormatString<{maxLength: 50}>>
//   type Name = TypeFromRT<typeof Name>;     // FormatString<{maxLength: 50}>
//
// Identity on non-`RunType` inputs, so it is safe to wrap any type:
//   TypeFromRT<string>                    // string
//   TypeFromRT<FormatString<{}>>          // FormatString<{}>
//   TypeFromRT<RunType<FormatString<{}>>> // FormatString<{}>

import type {RunType} from './types.ts';

/** The TS type a `RunType<T>` carries; identity for anything that isn't a
 *  `RunType`. The carrier is `{t: T}`, so `NonNullable` strips the `| undefined`
 *  the optional `?` adds to the WRAPPER and `['t']` reads `T` back — preserving an
 *  intentional `null`/`undefined` `T` (which a bare-`T` carrier + `NonNullable`
 *  would collapse to `never`). No `infer`. */
export type TypeFromRT<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT;

# Marker type silently degrades to `any` when its import doesn't resolve in the scan program

## Evidence (found during the mion migration, 2026-07-12)

A vitest spec imported its subject type with an extensionless relative path
(`import {User} from './user.runtype'`) under `moduleResolution: NodeNext`. Vite resolves
that import fine at RUNTIME, but the resolver's scan program does not — so at the
`createValidate<User>()` call site `User` checked as `any`:

- the binary emitted the noop tuple `['val',,,'Qgu_ECwQk0c','any',,true]` and no runtype row;
- `createValidate` became the always-true identity, `createGetValidationErrors` returned
  `[]`, `createMockData` returned `undefined`;
- 34 tests failed with **zero diagnostics** — no rtDiagnostic, no plugin warning, nothing
  naming the unresolved import or the `any` degradation.

Adding the `.ts` extension fixed all of it at once.

## Why it matters

This is the silent-failure mode users will actually hit (tsconfig/module-resolution skew
between vite and the scan program). A validator that silently validates NOTHING is the
worst failure shape for a validation library — the mion CLAUDE.md already warns about the
sibling `import type` erasure trap for the same reason.

## Fix directions

- Emit an Error-severity rtDiagnostic when a MARKER SITE's `T` resolves to `any`/`unknown`
  via an unresolved import (checker reports the unresolved module — surface it with the
  call-site location). A marker over an intentional `any` seems rare enough that a
  diagnostic with an explicit escape hatch (`// rt-expect-any`?) beats silence.
- Alternatively (weaker): warn whenever the scan program fails to resolve an import in a
  file that contains marker sites.

## Acceptance

- The repro above produces a build/transform diagnostic naming the file, the call site,
  and the unresolved specifier, in dev/test lanes as well as `vite build`.

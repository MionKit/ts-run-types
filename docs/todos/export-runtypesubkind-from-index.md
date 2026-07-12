# RunTypeSubKind is not exported from the package index

## Evidence (found during the mion drizze migration, 2026-07-12)

Builtin classes project atomically with a `subKind` (Date → `{kind: 20, subKind: 2001,
typeName: 'Date'}`), and `RunTypeSubKind` (with `date: 2001` etc.) exists in
`dist/runTypeKind.d.ts` — but it is NOT re-exported from the package index, so graph
consumers can't reach it (`import {RunTypeSubKind} from '@ts-runtypes/core'` fails).

Consequence: consumers walking the graph (mion's drizzle column mapper) must detect Date
by `typeName === 'Date'`, which false-positives on a user class literally named `Date`.
The consumer keying rule in CLAUDE.md ("every consumer keys on subKind") is not followable
from outside the package.

## Fix

Re-export `RunTypeSubKind` (and any sibling constants graph consumers need) from
`packages/ts-runtypes/src/index.ts`. One-liner + a type test.

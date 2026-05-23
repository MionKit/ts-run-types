// End-to-end acceptance test for marker-scanner diagnostics. Drives the
// Go binary over inline sources, verifying:
//
//   1. response.diagnostics surfaces an MKR001 warning when a marker
//      call's reflect-form value argument is a function-call expression
//      (`createIsType(getX())`).
//   2. The diagnostic message names the called function and recommends
//      the static `ReturnType<typeof fn>` idiom.
//   3. Legitimate identifier-argument shapes (`createIsType(v)`) do NOT
//      trigger the warning.
//   4. The diagnostic wire format renders via formatTscDiagnostic into
//      VS Code's `$tsc` problem-matcher line shape.
//   5. The site is still emitted alongside the diagnostic — the
//      validator works; the warning just nudges the user toward the
//      anti-pattern-free idiom.

import {describe, expect, it} from 'vitest';
import {formatTscDiagnostic} from '../src/index.ts';
import {Family, Severity, type Diagnostic} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

function markerDiagsOf(response: {diagnostics?: Diagnostic[]}): Diagnostic[] {
  return (response.diagnostics ?? []).filter((d) => d.family === Family.Marker);
}

describe('vite-plugin-runtypes / marker diagnostics', () => {
  const register = hasBinary() ? it : it.skip;

  register('warns when reflect-form arg is a function call (createIsType)', async () => {
    const sources = {
      'fn-call.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
function makeUser(): {id: number; name: string} {
  return {id: 1, name: 'john'};
}
export const _ = createIsType(makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('MKR001');
      expect(diagnostics[0].severity).toBe(Severity.Warning);
      // Args carry the dynamic identifier (function name); the catalog
      // template substitutes it into the headline and detail.
      expect(diagnostics[0].args).toEqual(['makeUser']);
      // Site still emitted — the validator works, the warning just nudges.
      expect(response.sites.length).toBe(1);
    });
  });

  register('warns for reflectRuntypeId with a function-call arg too', async () => {
    const sources = {
      'reflect-fn.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
function getValue(): string { return 'hello'; }
export const _ = reflectRuntypeId(getValue());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].args).toEqual(['getValue']);
    });
  });

  register('warns for method-call arg (PropertyAccess → CallExpression)', async () => {
    const sources = {
      'method-call.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
const state = {
  makeUser(): {id: number} { return {id: 1}; },
};
export const _ = createIsType(state.makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      // The callee is a property access — diagnostic uses the leaf name.
      expect(diagnostics[0].args).toEqual(['makeUser']);
    });
  });

  register('no warning for identifier arg', async () => {
    const sources = {
      'identifier.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
const user: {id: number; name: string} = {id: 1, name: 'john'};
export const _ = createIsType(user);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('no warning for property-access arg', async () => {
    const sources = {
      'property.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
const outer: {user: {id: number}} = {user: {id: 1}};
export const _ = createIsType(outer.user);
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('no warning for static form even when paired with a call', async () => {
    const sources = {
      'static-return.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
function makeUser(): {id: number} { return {id: 1}; }
export const _ = createIsType<ReturnType<typeof makeUser>>();
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      expect(markerDiagsOf(response)).toEqual([]);
    });
  });

  register('errors with MKR003 when marker call is inside a generic wrapper', async () => {
    const sources = {
      'free-tparam.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export function makeId<T>() {
  return getRuntypeId<T>();
}
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostics = markerDiagsOf(response);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].code).toBe('MKR003');
      // Error severity (not Warning): if the generic wrapper is ever
      // called, getRuntypeId() throws at runtime ("no id injected"). The
      // build halts so the user fixes the structural issue before
      // shipping the wrapper.
      expect(diagnostics[0].severity).toBe(Severity.Error);
      // MKR003 currently has no dynamic args — the catalog headline
      // names the issue ("generic function ... unresolved") generically.
      expect(diagnostics[0].args).toBeUndefined();
      // No site emitted — the marker can't be injected without a resolved T.
      // The user gets the build-time MKR003 + the runtime "no id injected"
      // throw when the wrapper is actually called.
      expect(response.sites.length).toBe(0);
    });
  });

  register('formatTscDiagnostic renders marker warnings in tsc line format', async () => {
    const sources = {
      'fmt.ts': `import {createIsType} from '@mionjs/ts-go-run-types';
function makeUser(): {id: number} { return {id: 1}; }
export const _ = createIsType(makeUser());
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(Object.keys(sources));
      const diagnostic = markerDiagsOf(response)[0];
      expect(diagnostic).toBeDefined();
      const line = formatTscDiagnostic(diagnostic);
      // VS Code's $tsc problem matcher expects: path(line,col): severity code: msg
      expect(line).toMatch(/^[^(]+\(\d+,\d+\):\s+warning\s+MKR001:\s+.+$/);
    });
  });
});

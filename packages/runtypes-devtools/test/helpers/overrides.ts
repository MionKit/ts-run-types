// Shared helpers for the overrideX suites (overrides.test.ts +
// overrides-type-families.test.ts). Both scan an isolated inline Program, then
// materialize the redirect→cfn and CALL the override.

import {evalEntryModules} from './inline.ts';
import type {ResolverClient} from '../../src/resolver-client.ts';
import type {Site} from '../../src/protocol.ts';

export type AnyFn = (...args: any[]) => any;

// scanResponse runs scanFiles(includeEntryModules) over the inline sources
// (skipping the always-overlaid runtypes.d.ts).
export async function scanResponse(client: ResolverClient, augmented: Record<string, string>) {
  const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
  return client.scanFiles(files, {includeEntryModules: true});
}

// materializeOverrideFn resolves a redirect entry and returns the live override
// function by following the redirect → cfn hop with a minimal rtUtils whose
// `usePureFn` reads the evaluated cfn tuple's factory (slot 8). The override is
// self-contained (pure), so no runtype/getRT wiring is needed. `site` defaults to
// the first site carrying an fnId; pass an explicit site to pick one of several
// override sites in a multi-family scan.
export function materializeOverrideFn(
  response: {sites: Site[]; entryModules?: Record<string, string>},
  site: Site | undefined = response.sites.find((s) => s.fnId)
): AnyFn {
  if (!site || !site.fnId) throw new Error('expected a site with an fnId');
  const tuples = evalEntryModules(response.entryModules ?? {});
  const redirect = tuples[site.fnId + '_' + site.id] as readonly unknown[];
  if (!redirect) throw new Error(`no redirect entry for ${site.fnId}_${site.id}`);

  const cfnByKey: Record<string, readonly unknown[]> = {};
  for (const tuple of Object.values(tuples)) {
    if (Array.isArray(tuple) && tuple[0] === 2) cfnByKey[String(tuple[3])] = tuple; // KIND_PURE_FN
  }
  const utl: {usePureFn(key: string): AnyFn} = {
    usePureFn(key: string): AnyFn {
      const cfn = cfnByKey[key];
      if (!cfn) throw new Error(`no cfn module for ${key}`);
      return (cfn[8] as (u: unknown) => AnyFn)(utl); // override factory ignores utl, returns the fn
    },
  };
  return (redirect[9] as (u: unknown) => AnyFn)(utl); // createRTFn(utl) → the override fn
}

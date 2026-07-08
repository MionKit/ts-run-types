// garble.mjs — shared helper for building the PUBLISHED Go artifacts (the 7 native
// resolver binaries + the playground wasm) with garble obfuscation.
//
// WHY: the shipped artifacts carry our proprietary resolver logic. garble renames
// our package/function/type/var identifiers to hashes (2000+ internal symbol refs
// -> 0) and `-tiny` strips the remaining metadata, so the artifact is much harder
// to reverse engineer (see docs/ARCHITECTURE.md). We only obfuscate OUR module
// (GOGARBLE=github.com/mionkit/*): garble panics trying to rewrite the vendored
// typescript-go / x/tools tree, and tsgo is public open source anyway — no point
// hiding it. Scoped obfuscation is verified safe: garble preserves struct layout
// (renames only, never reorders/resizes) so the unsafe checker mirrors keep
// working, and `-X` ldflags version injection survives garble. See SETUP.md ->
// Publishing.
//
// Escape hatch: RT_GARBLE=0 builds plain `go` (faster, real panic stack traces) —
// use it for local iteration. Default is obfuscated.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Pinned garble release. CI (.github/actions/bootstrap) installs this exact
// version; bump deliberately and re-verify (garble tracks the Go toolchain).
export const GARBLE_VERSION = 'v0.16.0';

// Obfuscate only our module; NEVER the vendored typescript-go (garble crashes on
// that tree, and it is public source). Verified to match our subpackages too.
export const GOGARBLE_SCOPE = 'github.com/mionkit/*';

// Obfuscation is on by default; RT_GARBLE=0 opts out.
export function garbleEnabled() {
  return process.env.RT_GARBLE !== '0';
}

// Locate the garble executable: prefer PATH, fall back to `$(go env GOPATH)/bin`
// (CI installs there but may not add it to PATH). Returns null if not found.
export function findGarble() {
  const exe = process.platform === 'win32' ? 'garble.exe' : 'garble';
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (dir && fs.existsSync(path.join(dir, exe))) return path.join(dir, exe);
  }
  try {
    const gopath = execFileSync('go', ['env', 'GOPATH'], {encoding: 'utf8'}).trim();
    const candidate = path.join(gopath, 'bin', exe);
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    // go not on PATH — caller handles the null.
  }
  return null;
}

// Resolve garble or throw a helpful error. Use where obfuscation is mandatory
// (publishing the native binaries); the wasm build warns + falls back instead.
export function requireGarble() {
  const found = findGarble();
  if (!found) {
    throw new Error(
      'garble not found. Install the pinned version:\n' +
        `  go install mvdan.cc/garble@${GARBLE_VERSION}\n` +
        'or set RT_GARBLE=0 to build without obfuscation.',
    );
  }
  return found;
}

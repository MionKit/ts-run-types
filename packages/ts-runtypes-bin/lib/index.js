import fs from 'node:fs';
import module from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Basename of the resolver executable inside every platform package's lib/
// directory (and of the locally built dev binary at <repo>/bin/).
const EXE_BASENAME = 'ts-runtypes';

function exeName() {
  return process.platform === 'win32' ? `${EXE_BASENAME}.exe` : EXE_BASENAME;
}

// Resolves the absolute path of a package's package.json without importing it.
// import.meta.resolve is sync on Node >= 20.6 / 18.19; older runtimes fall back
// to createRequire. We resolve package.json (always present) rather than the
// binary so the lookup never depends on an exports map for the payload file.
function resolvePackageJson(specifier) {
  if (typeof import.meta.resolve === 'function') {
    return fileURLToPath(import.meta.resolve(specifier));
  }
  const require = module.createRequire(import.meta.url);
  return require.resolve(specifier);
}

// Returns the absolute path to the ts-runtypes resolver binary for the host
// platform. In an installed tree it locates the matching optional dependency
// `ts-runtypes-binary-<platform>-<arch>`; inside this repo's source tree it
// falls back to the locally built `bin/ts-runtypes`. Throws a clear error when
// neither is available (unsupported platform, or the optional dep was skipped).
export function getExePath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const normalized = here.replace(/\\/g, '/');
  const platformKey = `${process.platform}-${process.arch}`;
  const platformPackage = `ts-runtypes-binary-${platformKey}`;

  // Dev: running from the workspace source (packages/ts-runtypes-bin/lib) —
  // prefer the locally built binary so the monorepo needs no platform package.
  if (normalized.endsWith('/packages/ts-runtypes-bin/lib')) {
    const devExe = path.join(here, '..', '..', '..', 'bin', exeName());
    if (fs.existsSync(devExe)) return devExe;
    // Not built yet — fall through so the thrown error points at the real fix.
  }

  let exeDir;
  try {
    const packageJsonPath = resolvePackageJson(`${platformPackage}/package.json`);
    exeDir = path.join(path.dirname(packageJsonPath), 'lib');
  } catch {
    throw new Error(
      `[ts-runtypes-bin] Unable to resolve ${platformPackage}. Either your platform/arch ` +
        `(${platformKey}) is unsupported, or its optional dependency was not installed ` +
        `(e.g. install ran with --no-optional / --ignore-optional, or a mirror omits it).`,
    );
  }

  let exe = path.join(exeDir, exeName());
  if (process.platform === 'win32' && exe.length >= 248) exe = `\\\\?\\${exe}`;
  if (!fs.existsSync(exe)) {
    throw new Error(
      `[ts-runtypes-bin] ${platformPackage} is installed but its binary is missing at ${exe}.`,
    );
  }
  return exe;
}

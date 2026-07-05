// scripts/env/load.mjs - load the repo-root .env into process.env for a directly
// invoked Node script. Mirrors scripts/env/registry.sh, using Node's built-in
// process.loadEnvFile (Node >= 20.12; this repo requires >= 24) - no dotenv package.
//
// DEV-ONLY: .env is git-ignored (never in a CI checkout) and we also skip loading
// when CI is set. No-op when .env is absent (so a Node script mounted alone inside
// the container - where there is no .env - just inherits its env). loadEnvFile does
// NOT override an already-set process.env var, so real CI/shell env always wins.
import {existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (!process.env.CI && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

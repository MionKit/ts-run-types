import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = resolve(HERE, 'check-go-binary.sh');

export default function setup() {
  const result = spawnSync('bash', [CHECK_SCRIPT], {stdio: 'inherit'});
  if (result.status !== 0) {
    throw new Error(
      'bin/ts-go-run-types is missing or out of sync with Go source — see message above. Tests aborted.'
    );
  }
}

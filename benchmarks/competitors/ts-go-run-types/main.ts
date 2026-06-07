import '@mionjs/ts-go-run-types/formats'; // register built-in format patterns (side effect)
import {cases} from './cases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';

const result = runCompetitor({name: 'ts-go-run-types', cases});
writeResult(result);
process.exit(result.summary.fail + result.summary.errored ? 1 : 0);

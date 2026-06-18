import {cases} from './cases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';

const result = runCompetitor({name: 'typebox', cases});
writeResult(result);
process.exit(result.summary.fail + result.summary.errored ? 1 : 0);

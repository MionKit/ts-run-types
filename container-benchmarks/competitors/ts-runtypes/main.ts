import './setup.ts'; // install the Temporal polyfill global BEFORE any case runs
import 'ts-runtypes/formats'; // register built-in format patterns (side effect)
import {cases} from './cases.ts';
import {runCompetitor} from '../../shared/harness/runner.ts';
import {writeResult} from '../../shared/harness/result.ts';

const result = runCompetitor({name: 'ts-runtypes', cases});
writeResult(result);
process.exit(result.summary.fail + result.summary.errored ? 1 : 0);

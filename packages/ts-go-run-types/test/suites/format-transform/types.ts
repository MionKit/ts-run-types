import type {FormatTransformFn} from '@mionjs/ts-go-run-types';

/** One format-transform case: a thunk wrapping `createFormatTransform<T>()`
 *  (plugin-rewritten at the call site) plus input → expected-output
 *  pairs the adapter feeds through it. **/
export interface FormatTransformCase {
  title: string;
  formatTransform: () => FormatTransformFn;
  getCases: () => Array<{input: unknown; expected: unknown}>;
}

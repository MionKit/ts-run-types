import {createMockType} from 'ts-runtypes';

type Account = {
  balance: number;
  label: string;
  tags?: string[];
};

// start-options
// Options can be set at the factory (apply to every call) or per call.
// They merge: defaults < factory < call.
const mockAccount = createMockType<Account>({
  mock: {
    minNumber: 0,
    maxNumber: 1000, // numbers land in [0, 1000]
    stringLength: 8, // every generated string is 8 chars
    optionalProbability: 1, // always include optional props like `tags`
  },
});

const rich = mockAccount({mock: {minNumber: 1_000_000}}); // override just for this call
// end-options

export {mockAccount, rich};

import type * as TF from 'ts-runtypes/formats';
import {createValidate, registerFormatPattern} from 'ts-runtypes';

// Register a reusable string pattern once. `mockSamples` are required —
// they double as canonical values the mock generator draws from, and each
// is checked against the regex at registration (a bad sample throws loudly).
const slug = registerFormatPattern({
  source: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
  mockSamples: ['my-post', 'hello-world-2'],
  message: 'must be a kebab-case slug',
});

// Reference it by `typeof` in a TF.String. Build-time validation + mocks
// both pick it up.
type Slug = TF.String<{pattern: typeof slug}>;

type Post = {slug: Slug; title: string};

const isPost = createValidate<Post>();
isPost({slug: 'my-first-post', title: 'Hi'}); // true
isPost({slug: 'Not A Slug!', title: 'Hi'}); // false

export {slug, isPost};
export type {Slug, Post};

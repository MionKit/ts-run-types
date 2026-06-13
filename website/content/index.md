---
seo:
  title: RunTypes — TypeScript types that show up at runtime
  description: Validation, JSON + binary serialization, mock data and reflection — generated straight from your TypeScript types. No schemas, no drift.
pageClass: home-page
---

:home-page-body

::gradient-bg
---
angle: 70
opacity: 0.2
blur: 150px
---
::

::u-page-hero{class="home-hero"}
#header
:::typed-title
---
leading: "We fixed TypeScript"
strikeWord: "fixed"
enhancedWord: "Enhanced"
titles:
  - 'And the reflection gap'
  - 'And writing types twice'
  - 'And your validation layer'
  - 'And handwritten serialization'
  - 'Say hello to RunTypes®'
---
#description
TypeScript decided it is **"Just a Linter"** and erase your types.
<br/>We respectfully **put them back in the runtime** in a way that's reliable and makes sense.
:::

#links
:::u-button
---
color: primary
size: xl
to: /introduction/about-ts-runtypes
icon: icon-park-outline:book-one
class: btn-docs
---
Read the Docs
:::

:::u-button
---
color: neutral
icon: simple-icons-github
size: xl
to: https://github.com/mionkit/ts-runtypes
variant: outline
---
Give us a Star
:::
::

::u-page-section
---
class: home-features
---
#title
Two ways to describe a shape, One source of truth.

#root
:::gradient-bg
---
angle: 70
opacity: 0.15
top: 10rem
blur: 140px
---
:::

#body
Write a plain TypeScript type (fastest, zero ceremony) **or** reach for the `RT.*` schema builders if you like the Zod / TypeBox feel. Both compile to the exact same validator — pick whichever you fancy, mix them in the same file.

:::div{class="rt-define-cols"}
::::code-group
<code-import path="packages/examples/src/_homepage/define-type.ts" lang="ts [Type definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/define-schema.ts" lang="ts [Schema]" />
::::
:::
::

::u-page-section
#title
Formats baked into your types

#body
:::div{class="rt-formats-cols"}
::::card{class="rt-feature-card"}
### Validate the shape, not just the kind
Ensure type safety with formats like:    
`email`, `uuidv4`, `ipv4`, `int32`, `positive` and more. 

The validator checks its exact shape, not just its kind. No regex to wire up, no separate schema to keep in sync.

:::::div{class="rt-formats-tile"}
#### Temporal Support
Full TC39 Temporal — `PlainDate`, `ZonedDateTime`, `Duration`… validated and serialized like any built-in.
:::::
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-type.ts" lang="ts [Type definition]" />
::::

::::code-group
<code-import path="packages/examples/src/_homepage/formats-schema.ts" lang="ts [Schema]" />
::::
:::
::

::u-page-section
#title
One object, Every function.

#body
:::div{class="rt-feature-row"}
::::card{class="rt-feature-card"}
### Define it once
Then ask for whatever you need — a validator, an error reporter, JSON that round-trips `Date`s, a compact binary codec, or believable mock data. No reflection at runtime: each one is a specialized function generated at build time.

<br>

[One type in, every function out.]{.text-highlighted}
::::

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-type" commentEnd="// end-type" />
:::

:::div{class="rt-object-fns"}
::::div{class="rt-object-fn"}
### Validate
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-validate" commentEnd="// end-validate" />
::::

::::div{class="rt-object-fn"}
### JSON
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-json" commentEnd="// end-json" />
::::

::::div{class="rt-object-fn"}
### Binary
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-binary" commentEnd="// end-binary" />
::::

::::div{class="rt-object-fn"}
### Mock
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-mock" commentEnd="// end-mock" />
::::
:::
::

::u-page-section
#title
The reflection TypeScript never shipped

#body
:::div{class="rt-feature-row"}
<code-import path="packages/examples/src/_homepage/reflection.ts" lang="ts" />

::::card{class="rt-feature-card"}
### Recover the type graph
Get back a traversable RunType node — the same graph the library walks internally: kind, property names, nested children, format annotations and more. Bring a type or infer it from a runtime value, then read it however you need — to drive codegen, build forms, or power your own tooling.

<br>

[Reflection you can actually walk.]{.text-highlighted}
::::
:::
::

::u-page-section
#title
Performance is nothing without control

#body
:::div{class="rt-feature-row rt-feature-row--top"}
::::card{class="rt-feature-card"}
### Toe to Toe with the fastest
Our performance matches the fastest validators (AJV, TypeBox, Typia)    
Even in their faster JIT mode, but without any JIT compilation cost.

:::::perf-bars
---
caption: Validation throughput — is-valid check (ops/sec, higher is better)
footnote: Zod has no fast is-valid path — it validates by parsing to errors, so its bar is the error-reporting result.
bars:
  - name: ts-runtypes
    score: 40.6
    label: 40.6M
    highlight: true
  - name: typia
    score: 39.7
    label: 39.7M
  - name: typebox-Jit
    score: 38.2
    label: 38.2M
  - name: ajv-Jit
    score: 36.9
    label: 36.9M
  - name: zod
    score: 7.9
    label: 7.9M
    muted: true
---
:::::

:::::div{class="rt-card-footer"}
[See the full head-to-head →](/benchmarks/validation)
:::::
::::

::::card{class="rt-feature-card"}
### Tested to the highest standard
:::::stat-tiles
---
tiles:
  - value: "6,025"
    label: front-end tests
    sub: Vitest — marker + plugin
    hue: 145
  - value: "846"
    label: Go tests
    sub: go test ./internal
    hue: 198
  - value: "∞"
    label: Fuzzy Testing
    sub: Random inputs and randomly-generated types, checked against invariants — every finding replayable from a seed.
    hue: 280
    wide: true
    to: /suites/fuzzing
---
:::::

Every transform, cache shape and generated function is covered — on top of an extensive structured suite spanning validation, JSON, binary, mocks and reflection.

:::::div{class="rt-card-footer"}
[Correctness, pinned down →](/suites/validation)
:::::
::::
:::
::

::u-page-section
#title
The whole toolbelt, in one box

#body
Stop gluing five libraries together. RunTypes shares a single type graph across everything it generates — so the validator and the serializer always agree on what your type means.

:::card-group
---
class: sm:grid-cols-2 lg:grid-cols-3 home-toolbelt
---
  ::::card
  ---
  title: Validation
  icon: i-lucide-shield-check
  ---
  `createValidate` for fast yes/no checks, `createGetValidationErrors` for detailed reports.
  ::::

  ::::card
  ---
  title: JSON that round-trips
  icon: i-lucide-braces
  ---
  `Date`, `BigInt`, `Map`, `Set` survive the trip. Three strategies: clone, mutate, direct.
  ::::

  ::::card
  ---
  title: Binary codec
  icon: i-lucide-binary
  ---
  `createBinaryEncoder` / `createBinaryDecoder` for compact, fast payloads.
  ::::

  ::::card
  ---
  title: Mock data
  icon: i-lucide-dices
  ---
  `createMockType` invents valid, type-shaped data for your tests and fixtures.
  ::::

  ::::card
  ---
  title: Reflection
  icon: i-lucide-scan-text
  ---
  `getRunTypeId` (static or from a value), plus function-signature reflection.
  ::::

  ::::card
  ---
  title: Type formats
  icon: i-lucide-mail-check
  ---
  `email`, `uuidv4`, `ipv4`, `int32`, `positive`… baked straight into your types.
  ::::
:::
::

::u-page-section
#title
Tree-shaken to the bone

#body
:::div{class="rt-treeshake-cols"}
::::card{class="rt-feature-card"}
### Ship only what you call
Caches are demand-driven and every entry is its own module, so bundlers split and tree-shake natively. A file that only reflects an id ships zero validation code — and the Vite plugin adds zero runtime dependencies.

<br>

[Build-time, not run-time.]{.text-highlighted}
::::

::::code-group
```ts [Source Code]
type Order = {
  id: string;
  name: number;
  email: string;
};

const isUser = createValidate<User>();
```

```ts [Transformed]
import {__rt_a1b_Xk7} from 'virtual:rt/a1b_Xk7.js';

type Order = {
  id: string;
  name: number;
  email: string;
};

const isUser = createValidate<User>(__rt_a1b_Xk7);
```
::::

::::code-group
```js [Generated Module a1b_Xk7]
// shown as a function for clarity — the real emit is a positional
// tuple: faster to initialise, fewer bytes on the wire
export function __rt_a1b_Xk7(value) {
  return typeof value === "object" && value !== null &&
  typeof value.id === "number" &&
  typeof value.name === "string" &&
  typeof value.email === "string";
}
```
::::
:::
::

[&nbsp;]{style="padding-bottom: 6rem;"}

<!-- code-import-timestamp 1781643665080 -->

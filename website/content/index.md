---
seo:
  title: ts-run-types — TypeScript types that show up at runtime
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
titles:
  - 'And the reflection gap'
  - 'And writing types twice'
  - 'And your validation layer'
  - 'And handwritten serialization'
  - 'Say hello ro RunTypes®'
---
#description
TypeScript decided it's **"just a linter"** and erases your types.
<br/>We respectfully **put them back in the runtime** in a way that's makes sense and reliable.
:::

#links
:::u-button
---
color: primary
size: xl
to: /introduction/about-ts-run-types
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
to: https://github.com/mionkit/ts-run-types
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
Two ways to describe a shape. One source of truth.

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

:::code-group
<code-import path="packages/examples/src/_homepage/define-type.ts" lang="ts [Pure type]" />
<code-import path="packages/examples/src/_homepage/define-schema.ts" lang="ts [Schema]" />
:::
::

::u-page-section
#title
One object. Every function.

#body
Define a real type once, then ask for whatever you need — a validator, an error reporter, JSON that round-trips `Date`s, a compact binary codec, or believable mock data. No reflection at runtime: each one is a specialized function generated at build time.

Here's the type everything below is generated from:

<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts" commentStart="// start-type" commentEnd="// end-type" />

:::code-group
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts [validate]" commentStart="// start-validate" commentEnd="// end-validate" />
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts [json]" commentStart="// start-json" commentEnd="// end-json" />
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts [binary]" commentStart="// start-binary" commentEnd="// end-binary" />
<code-import path="packages/examples/src/_homepage/showcase.ts" lang="ts [mock]" commentStart="// start-mock" commentEnd="// end-mock" />
:::
::

::u-page-section
#title
The reflection TypeScript refused to ship

#body
Get a stable id for any type, infer it from a value, or wrap ts-run-types into your own helpers with a single marker — `InjectRunTypeId<T>`. The build fills it in at every call site.

<code-import path="packages/examples/src/_homepage/reflection.ts" lang="ts" />
::

::u-page-section
#title
The whole toolbelt, in one box

#body
Stop gluing five libraries together. ts-run-types shares a single type graph across everything it generates — so the validator and the serializer always agree on what your type means.

:::card-group
---
class: sm:grid-cols-2 lg:grid-cols-3
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
You only ship the functions you actually call. Caches are demand-driven and every entry is its own module, so a file that only reflects an id ships zero validation code.

:::stylish-list
---
type: check
---
- [Demand-driven caches]{.text-highlighted} — a family's cache holds only the types its own call sites request.
- [Per-call-site code-splitting]{.text-highlighted} — every cache entry is its own module, so bundlers split and tree-shake natively.
- [Zero runtime dependencies]{.text-highlighted} — the Vite plugin adds nothing to your runtime `node_modules`.
- [Build-time, not run-time]{.text-highlighted} — no schema objects to construct, no reflection cost when your app runs.
:::
::

::u-page-section
#title
How does it stack up?

#body
:::card
---
to: /benchmarks/validation
---
ts-run-types is the rare library that does **both** type-first _and_ schema-first — and adds JSON, binary, mocks and reflection on top. See the honest, head-to-head benchmarks against **Zod, TypeBox and AJV**.
:::
::

[&nbsp;]{style="padding-bottom: 6rem;"}

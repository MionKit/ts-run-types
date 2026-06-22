# Split the docs site into two navigable areas: Docs + Benchmarks

> **Status: pending (attempted + reverted 2026-06-22).** Goal: top-level header tabs
> "Docs" and "Benchmarks", each with its OWN left sidebar (inside Benchmarks the
> sidebar shows only benchmark pages, not the docs tree). Attempted via Docus's
> native `navigation.sub` + a content-dir regroup; it did not work because of how
> Docus models content collections (details below). Reverted to the working single
> sidebar; this captures the root cause and the approach that WOULD work.

## What was tried (and reverted)

1. Regrouped `content/` into `1.docs/` (introduction, guide, ai-integration, suites,
   diagnostics) + `2.benchmarks/`, rewrote internal links to `/docs/*`, added a
   `_redirects` file.
2. Set `navigation.sub: 'header'` in `app.config.ts` (Docus's built-in section mode).
3. Added a `content.config.ts` override so one `docs` collection includes ALL content.

Result: the section bar showed the doc SUBSECTIONS (Introduction/Guide/AI/Suites) as
tabs instead of `Docs | Benchmarks`, and the benchmarks page still rendered the docs
sidebar. All reverted.

## Root cause (Docus content model)

- Docus (`node_modules/docus/content.config.ts`) builds a SINGLE `docs` page
  collection: `include: hasDocsFolder ? 'docs/**' : '**'`, `prefix: hasDocsFolder ?
  '/docs' : '/'`. Naming a folder `docs` flips `hasDocsFolder`, scoping the collection
  to the docs folder only.
- Docus's app (`app/app.vue`) ALWAYS provides one navigation: `provide('navigation',
  queryCollectionNavigation(collectionName))` with `collectionName` hardcoded to
  `'docs'` (or `docs_<locale>`). Every layout/header/sidebar reads that single
  injected nav.
- `useSubNavigation` (the `navigation.sub` feature) only sub-divides THAT one
  collection's tree; it is for sub-sections within the docs, not two top-level areas.
- Observed discrepancy worth noting for next time: a server-side
  `queryCollectionNavigation('docs')` returned the GROUPED tree `[Docs → (...),
  Benchmarks → (...)]`, but the app's injected navigation rendered a FLATTENED tree
  (the doc subsections + benchmarks as siblings). So even with the right collection
  data, Docus's app did not produce the two-area grouping.

So Docus's defaults do not support two navigable top-level areas with separate
sidebars. It needs a custom solution that bypasses the single-`docs`-collection model.

## Approach that would work (custom page + layout + explicit collections)

1. **Explicit collections** in `container/website/content.config.ts`: a `docs`
   collection (`source.include: 'docs/**'` or `'1.docs/**'`, `prefix: '/docs'`) AND a
   `benchmarks` collection (`include: 'benchmarks/**'`, `prefix: '/benchmarks'`), plus
   `landing` (index.md). Verify the app config actually overrides Docus's (it appeared
   to for a server query but not for the app's injected nav — confirm via the running
   app, e.g. a temporary `/api` route dumping `queryCollectionNavigation`).
2. **Custom page** `app/pages/[...slug].vue` (overriding Docus's): compute the section
   from the route (`/benchmarks/*` -> `benchmarks`, else `docs`), then
   `queryCollection(section)` / `queryCollectionItemSurroundings(section, ...)` and
   `queryCollectionNavigation(section)` for THAT section. Provide that nav to the
   layout (don't rely on Docus's global `provide('navigation')`).
3. **Custom layout** `app/layouts/docs.vue` (overriding Docus's trivial one): render a
   header switcher with two fixed tabs (Docs -> first docs page, Benchmarks -> first
   benchmark page, active by route prefix) + `UPageAside` fed the section nav +
   `<slot/>` + the existing TOC.
4. Redirects for moved doc URLs (`/introduction/*` -> `/docs/introduction/*`) via a
   Cloudflare `public/_redirects` (with `:splat`), since the local static server does
   not process it.

### Simpler alternative (if two tabs aren't essential)

Keep the original FLAT content structure (no `/docs` folder, so one `**` collection)
and set `navigation.sub: 'header'`. Each existing top-level section (Introduction,
Guide, AI Integration, Test Suites, Benchmarks) then becomes its own header tab with a
scoped sidebar. This is ~1 config line and uses Docus natively (it was the variant
that nearly rendered). It gives Benchmarks its own sidebar, just as 5 tabs instead of
2, and keeps all current URLs.

## Acceptance

- `/benchmarks/*` shows a sidebar with ONLY benchmark pages; `/docs/*` (or the doc
  sections) show ONLY doc pages.
- A header switcher toggles the two areas; active state follows the route.
- All internal links + (if URLs change) redirects resolve; static build has no file
  over Cloudflare's 25 MiB cap.

import { fileURLToPath } from 'node:url'
import { processCodeImports, exampleWatcherPlugin } from './server/utils/code-import'

const isDev = process.env.NODE_ENV !== 'production'

// Bind-mounted source on macOS/VM container hosts doesn't deliver fs events into
// the container, so native watchers never fire. RT_WEBSITE_POLL=1 sets this env
// (see scripts/website/site.mjs) to make the watchers poll instead.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'

// The playground engine (app/playground) imports the ts-runtypes RUNTIME factories.
// The compiled DIST is VENDORED into the project (git-ignored, host-synced by
// container/website/scripts/build-playground.mjs) rather than aliased to the
// external repo-context mount, because Vite's dev server only serves modules inside
// the project root. Vendoring the dist (not src) means Vite serves plain ESM with
// no per-file TS transpile (which breaks on type-only re-exports in dev). Only
// `ts-runtypes` and `ts-runtypes/formats` are aliased (exact-match regex); the
// resolver's source OVERLAY is a separately fetched static asset. The relative path
// resolves the same in the container and on a host.
const rtDist = fileURLToPath(new URL('./app/playground/.vendor/ts-runtypes-dist', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  site: {
    name: 'ts-runtypes',
  },
  css: [
    '~/assets/css/mion.css',
    '@shikijs/twoslash/style-rich.css',
  ],
  app: {
    // baseURL: '/mion/', // working with github pages mionkit.github.io/mion/ - Remove when using mion.io
    buildAssetsDir: '_assets', // don't use "_" at the beginning of the folder name to avoid nojekyll conflict
  },
  colorMode: {
    preference: 'dark'
  },
  modules: [
    "@nuxt/content",
    "@nuxt/eslint",
    "@nuxt/image",
    "@nuxt/scripts",
    "@nuxt/ui"
  ],
  content: {
    watch: {
      enabled: isDev
    }
  },
  vite: {
    server: usePolling ? { watch: { usePolling: true, interval: 300 } } : {},
    plugins: isDev ? [exampleWatcherPlugin(usePolling)] : [],
    resolve: {
      alias: [
        { find: /^@ts-runtypes\/core\/formats$/, replacement: `${rtDist}/formats/index.js` },
        { find: /^@ts-runtypes\/core$/, replacement: `${rtDist}/index.js` }
      ]
    },
    // Monaco is loaded lazily (client-only) with a no-op worker stub, so Vite must
    // not pre-bundle it (its optional worker entry points break optimizeDeps).
    optimizeDeps: { exclude: ['monaco-editor'] }
  },
  nitro: {
    output: {
      publicDir: '.output/public'
    }
  },
  hooks: {
    'content:file:beforeParse'(ctx) {
      const { file } = ctx
      if (!file.id.endsWith('.md')) return
      file.body = processCodeImports(file.body, isDev)
    }
  }
})
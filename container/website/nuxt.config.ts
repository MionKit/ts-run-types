import { processCodeImports, exampleWatcherPlugin } from './server/utils/code-import'

const isDev = process.env.NODE_ENV !== 'production'

// Bind-mounted source on macOS/VM container hosts doesn't deliver fs events into
// the container, so native watchers never fire. RT_WEBSITE_POLL=1 sets this env
// (see scripts/website.sh) to make the watchers poll instead.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true'

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
    plugins: isDev ? [exampleWatcherPlugin(usePolling)] : []
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
// Server-side Shiki highlighter for the small code snippets shown in the
// suite / benchmark hover panels. Mirrors the setup in server/api/twoslash.post.ts
// (github-dark + github-light dual theme, ts/js grammars) but without the twoslash
// type pass — these panels just need syntax colors. A singleton highlighter + cache
// cache keep repeat requests cheap. Rendering happens on the server, so the
// browser receives already-highlighted HTML and ships no Shiki bundle.

import {createHighlighter} from 'shiki'

let highlighterPromise: ReturnType<typeof createHighlighter> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['typescript', 'javascript'],
    })
  }
  return highlighterPromise
}

const cache = new Map<string, string>()

export async function highlightCode(code: string, lang: 'ts' | 'js'): Promise<string> {
  const langId = lang === 'js' ? 'javascript' : 'typescript'
  const key = `${langId}:${code}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const highlighter = await getHighlighter()
  // Dual theme so one render serves both color modes: the dark theme is inlined
  // (the site defaults to dark) and the light theme rides CSS variables that a
  // `:root.light` rule swaps in — no per-request theme, no re-highlight on toggle.
  const html = highlighter.codeToHtml(code, {
    lang: langId,
    themes: {dark: 'github-dark', light: 'github-light'},
    defaultColor: 'dark',
  })
  cache.set(key, html)
  return html
}

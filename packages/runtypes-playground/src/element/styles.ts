// Styles for the light-DOM <runtypes-playground> element. Every selector is
// scoped under `.rt-playground` so injecting this once into document head does
// not leak into the host page. Light DOM is deliberate: Monaco measures layout
// and injects its own styles into document head, which shadow DOM breaks.
export const STYLES = `
.rt-playground {
  --rtpg-bg: #0e1116; --rtpg-panel: #161b22; --rtpg-panel-2: #1c2230;
  --rtpg-border: #2b3340; --rtpg-text: #d7dde6; --rtpg-muted: #8b96a5;
  --rtpg-accent: #79af43; --rtpg-accent-dim: #5d8a32; --rtpg-ok: #79af43;
  --rtpg-err: #e3534f; --rtpg-warn: #d9a441;
  --rtpg-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --rtpg-sans: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  display: block; position: relative; background: var(--rtpg-bg); color: var(--rtpg-text);
  font-family: var(--rtpg-sans); font-size: 14px; border: 1px solid var(--rtpg-border);
  border-radius: 10px; overflow: hidden; min-height: 460px;
}
.rt-playground * { box-sizing: border-box; }
/* Columns: Source | Generated Cache | Function. The cache column is a touch
   narrower than the Source column; the Function/controls column is narrowest. */
.rt-playground .rtpg-layout { display: grid; grid-template-columns: 1.1fr 1fr 0.9fr; gap: 1px; background: var(--rtpg-border); min-height: 460px; }
@media (max-width: 1000px) { .rt-playground .rtpg-layout { grid-template-columns: 1fr; } }
.rt-playground .rtpg-pane { background: var(--rtpg-bg); display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.rt-playground .rtpg-head { display: flex; align-items: baseline; justify-content: space-between; padding: 9px 13px; border-bottom: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-head h2 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--rtpg-muted); }
.rt-playground .rtpg-hint { color: var(--rtpg-muted); font-size: 12px; }
.rt-playground .rtpg-hint code, .rt-playground .rtpg-head code { font-family: var(--rtpg-mono); color: var(--rtpg-accent); }
.rt-playground .rtpg-editor { flex: 1; min-height: 280px; }

/* Type column: the editable body sits in a stack between a read-only import
   header and a read-only call footer (all three share a gutter so they read as
   one file), with the "after build" transformed view below them. */
.rt-playground .rtpg-typepane { min-width: 0; }
.rt-playground .rtpg-typestack { flex: 3 1 0; min-height: 210px; display: flex; flex-direction: column; background: #1e1e1e; overflow: hidden; }
.rt-playground .rtpg-typestack .rtpg-editor { flex: 1 1 auto; min-height: 120px; }
.rt-playground .rtpg-ro-wrap { position: relative; flex: 0 0 auto; overflow: hidden; }
.rt-playground .rtpg-ro-editor { width: 100%; }
.rt-playground .rtpg-ro-header { border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.rt-playground .rtpg-ro-footer { border-top: 1px solid rgba(255, 255, 255, 0.06); }
/* Hatch overlay marks a strip as read-only and swallows clicks (pointer-events:
   auto), so it cannot be focused or edited (the editor beneath is readOnly too -
   belt and suspenders). Uses the site's accent green so it reads as part of RunTypes. */
.rt-playground .rtpg-ro-hatch { position: absolute; inset: 0; cursor: default; pointer-events: auto;
  background: repeating-linear-gradient(135deg, transparent 0 5px, rgba(121, 175, 67, 0.16) 5px 6px); }

/* "After build" section: its header strip + the transformed-code view. */
.rt-playground .rtpg-subhead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 7px 13px; border-top: 1px solid var(--rtpg-border); border-bottom: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-subhead h3 { margin: 0; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--rtpg-muted); }
.rt-playground .rtpg-transformview { flex: 2 1 0; min-height: 120px; display: flex; flex-direction: column; }
.rt-playground .rtpg-transformview > .rtpg-code { flex: 1; margin: 0; border: 0; border-radius: 0; }
.rt-playground .rtpg-transformview > .rtpg-loading,
.rt-playground .rtpg-transformview > .rtpg-placeholder { padding: 13px; }
.rt-playground .rtpg-controls { padding: 12px; display: flex; flex-direction: column; gap: 9px; overflow: auto; flex: 1; min-height: 0; }
.rt-playground .rtpg-field { display: flex; flex-direction: column; gap: 6px; }
.rt-playground .rtpg-field-label { font-size: 12px; color: var(--rtpg-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.rt-playground .rtpg-field-label-row { display: flex; align-items: center; justify-content: space-between; }
.rt-playground .rtpg-select { appearance: none; background: var(--rtpg-panel-2); color: var(--rtpg-text); border: 1px solid var(--rtpg-border); border-radius: 8px; padding: 9px 12px; font-family: var(--rtpg-mono); font-size: 13px; cursor: pointer; }
.rt-playground .rtpg-select:focus { outline: none; border-color: var(--rtpg-accent-dim); }
.rt-playground .rtpg-blurb { margin: 0; color: var(--rtpg-muted); font-size: 12px; line-height: 1.45; }
.rt-playground .rtpg-input-field[hidden] { display: none; }
.rt-playground .rtpg-input-editor { height: 150px; border: 1px solid var(--rtpg-border); border-radius: 8px; overflow: hidden; }
.rt-playground .rtpg-encoded-field[hidden] { display: none; }
.rt-playground .rtpg-encoded { height: 150px; overflow: auto; margin: 0; font-family: var(--rtpg-mono); font-size: 12.5px; line-height: 1.5; background: var(--rtpg-panel); border: 1px solid var(--rtpg-border); border-radius: 8px; padding: 12px; white-space: pre-wrap; word-break: break-word; }
.rt-playground .rtpg-btn-row { display: flex; gap: 6px; }
.rt-playground .rtpg-ghost-btn { background: transparent; border: 1px solid var(--rtpg-border); color: var(--rtpg-muted); border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; white-space: nowrap; }
.rt-playground .rtpg-ghost-btn:hover { color: var(--rtpg-accent); border-color: var(--rtpg-accent-dim); }
.rt-playground .rtpg-ghost-btn[data-el="genInvalid"]:hover { color: var(--rtpg-err); border-color: var(--rtpg-err); }
.rt-playground .rtpg-run-btn { background: var(--rtpg-accent); color: #0e1116; border: none; border-radius: 8px; padding: 11px 14px; font-weight: 700; font-size: 14px; cursor: pointer; }
.rt-playground .rtpg-run-btn:hover { background: var(--rtpg-accent-dim); }
.rt-playground .rtpg-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rt-playground .rtpg-codeview { flex: 1; min-height: 0; overflow: auto; }
/* The cache column shows one section per generated module: a sticky filename
   header (the virtual:rt specifier the transform imports) + its source, with
   imports kept so a codec's cross-module structure is visible. */
.rt-playground .rtpg-cache-file-head { position: sticky; top: 0; z-index: 1; font-family: var(--rtpg-mono); font-size: 11.5px; color: var(--rtpg-accent); background: var(--rtpg-panel); padding: 6px 12px; border-top: 1px solid var(--rtpg-border); border-bottom: 1px solid var(--rtpg-border); }
.rt-playground .rtpg-cache-file:first-child .rtpg-cache-file-head { border-top: 0; }
.rt-playground .rtpg-cache-file > .rtpg-code { margin: 0; border: 0; border-radius: 0; overflow: visible; }
.rt-playground .rtpg-codeview > .rtpg-code { margin: 0; border: 0; border-radius: 0; }
.rt-playground .rtpg-codeview > .rtpg-loading,
.rt-playground .rtpg-codeview > .rtpg-card-note,
.rt-playground .rtpg-codeview > .rtpg-placeholder { padding: 13px; }
.rt-playground .rtpg-result-label { display: flex; align-items: baseline; justify-content: space-between; font-size: 11px; color: var(--rtpg-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.rt-playground .rtpg-result { flex: 1; min-height: 80px; overflow: auto; padding: 10px; border: 1px solid var(--rtpg-border); border-radius: 8px; background: var(--rtpg-bg); }
.rt-playground .rtpg-badge { display: inline-block; font-family: var(--rtpg-mono); font-weight: 700; padding: 6px 12px; border-radius: 8px; margin-bottom: 12px; }
.rt-playground .rtpg-badge.ok { background: rgba(121,175,67,0.15); color: var(--rtpg-ok); border: 1px solid var(--rtpg-accent-dim); }
.rt-playground .rtpg-badge.bad { background: rgba(227,83,79,0.15); color: var(--rtpg-err); border: 1px solid var(--rtpg-err); }
.rt-playground .rtpg-block-label { font-size: 12px; color: var(--rtpg-muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 14px 0 6px; }
.rt-playground .rtpg-code { margin: 0; font-family: var(--rtpg-mono); font-size: 12.5px; line-height: 1.5; background: var(--rtpg-panel); border: 1px solid var(--rtpg-border); border-radius: 8px; padding: 12px; overflow: auto; white-space: pre; }
.rt-playground pre.rtpg-code { white-space: pre-wrap; word-break: break-word; }
.rt-playground .rtpg-code.error { color: var(--rtpg-err); border-color: var(--rtpg-err); white-space: pre-wrap; }
.rt-playground .rtpg-diag { margin-top: 14px; }
.rt-playground .rtpg-diag-item { font-family: var(--rtpg-mono); font-size: 12px; padding: 6px 10px; border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-diag-item.error { color: var(--rtpg-err); border-color: var(--rtpg-err); }
.rt-playground .rtpg-diag-item.warning { color: var(--rtpg-warn); border-color: var(--rtpg-warn); }
.rt-playground .rtpg-placeholder { color: var(--rtpg-muted); font-size: 13px; }

/* Toolbar: the TS/Schema switch + presets sit together in one enclosed group —
   both choose what fills the Type editor, so grouping shows they are related. */
.rt-playground .rtpg-toolbar { display: flex; align-items: center; justify-content: flex-start; gap: 12px; flex-wrap: wrap; padding: 0; border-bottom: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-typegroup { display: flex; flex: 1; align-items: center; gap: 8px; flex-wrap: wrap; padding: 5px 7px; border: border-radius: 10px; background: var(--rtpg-bg); }
.rt-playground .rtpg-typegroup-sep { width: 1px; align-self: stretch; background: var(--rtpg-border); margin: 1px 2px; }
.rt-playground .rtpg-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.rt-playground .rtpg-preset { background: var(--rtpg-panel-2); color: var(--rtpg-text); border: 1px solid var(--rtpg-border); border-radius: 999px; padding: 5px 12px; font-size: 12.5px; cursor: pointer; }
.rt-playground .rtpg-preset:hover { border-color: var(--rtpg-accent-dim); color: var(--rtpg-accent); }
.rt-playground .rtpg-preset.is-active { background: var(--rtpg-accent); color: #0e1116; border-color: var(--rtpg-accent); font-weight: 600; }
/* Segmented toggle (not a primary button): a recessed container with two
   segments; the active one sits "pressed in" (darker bg + full-opacity file icon). */
.rt-playground .rtpg-modeswitch { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--rtpg-border); border-radius: 8px; background: var(--rtpg-panel-2); }
.rt-playground .rtpg-mode { display: inline-flex; align-items: center; gap: 6px; background: transparent; color: var(--rtpg-muted); border: 0; border-radius: 6px; padding: 5px 11px; font-size: 12.5px; cursor: pointer; transition: background 0.12s, color 0.12s; }
.rt-playground .rtpg-mode svg { width: 15px; height: 15px; display: block; opacity: 0.5; transition: opacity 0.12s; }
.rt-playground .rtpg-mode:hover { color: var(--rtpg-text); }
.rt-playground .rtpg-mode:hover svg { opacity: 1; }
.rt-playground .rtpg-mode.is-active { background: var(--rtpg-bg); color: var(--rtpg-text); font-weight: 600; box-shadow: inset 0 0 0 1px var(--rtpg-border); }
.rt-playground .rtpg-mode.is-active svg { opacity: 1; }

/* "Auto-generated by RunTypes" badge under the input. */
.rt-playground .rtpg-mock-badge { margin-top: 6px; font-size: 11px; line-height: 1.4; color: var(--rtpg-muted); background: rgba(121, 175, 67, 0.08); border: 1px solid var(--rtpg-accent-dim); border-radius: 6px; padding: 5px 8px; }
.rt-playground .rtpg-mock-badge code { font-family: var(--rtpg-mono); color: var(--rtpg-accent); }

/* Generated-code column: spinner while (re)generating; a note for no-op families. */
.rt-playground .rtpg-loading { display: flex; align-items: center; gap: 9px; color: var(--rtpg-muted); font-size: 13px; padding: 4px 0; }
.rt-playground .rtpg-spinner { width: 15px; height: 15px; border: 2px solid var(--rtpg-border); border-top-color: var(--rtpg-accent); border-radius: 50%; animation: rtpg-spin 0.7s linear infinite; }
@keyframes rtpg-spin { to { transform: rotate(360deg); } }
.rt-playground .rtpg-card-note { color: var(--rtpg-muted); font-size: 12.5px; font-style: italic; }

/* Loading overlay: covers the whole playground until Monaco + the resolver WASM
   are ready (they are fetched lazily, so this is the visible loading state). */
.rt-playground .rtpg-overlay { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: var(--rtpg-bg); }
.rt-playground .rtpg-overlay[hidden] { display: none; }
.rt-playground .rtpg-overlay-box { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; max-width: 380px; padding: 24px; }
.rt-playground .rtpg-spinner-lg { width: 28px; height: 28px; border-width: 3px; }
.rt-playground .rtpg-overlay-title { font-size: 15px; font-weight: 600; color: var(--rtpg-text); }
.rt-playground .rtpg-overlay-sub { font-size: 12.5px; color: var(--rtpg-muted); line-height: 1.5; }
.rt-playground .rtpg-overlay-err { color: var(--rtpg-err); font-family: var(--rtpg-mono); white-space: pre-wrap; text-align: left; }
`;

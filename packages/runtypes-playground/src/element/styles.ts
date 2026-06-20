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
  display: block; background: var(--rtpg-bg); color: var(--rtpg-text);
  font-family: var(--rtpg-sans); font-size: 14px; border: 1px solid var(--rtpg-border);
  border-radius: 10px; overflow: hidden;
}
.rt-playground * { box-sizing: border-box; }
.rt-playground .rtpg-layout { display: grid; grid-template-columns: 1.1fr 0.9fr 1.1fr; gap: 1px; background: var(--rtpg-border); min-height: 460px; }
@media (max-width: 1000px) { .rt-playground .rtpg-layout { grid-template-columns: 1fr; } }
.rt-playground .rtpg-pane { background: var(--rtpg-bg); display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.rt-playground .rtpg-head { display: flex; align-items: baseline; justify-content: space-between; padding: 9px 13px; border-bottom: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-head h2 { margin: 0; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--rtpg-muted); }
.rt-playground .rtpg-hint { color: var(--rtpg-muted); font-size: 12px; }
.rt-playground .rtpg-hint code, .rt-playground .rtpg-head code { font-family: var(--rtpg-mono); color: var(--rtpg-accent); }
.rt-playground .rtpg-editor { flex: 1; min-height: 280px; }
.rt-playground .rtpg-controls { padding: 12px; display: flex; flex-direction: column; gap: 9px; overflow: auto; }
.rt-playground .rtpg-field { display: flex; flex-direction: column; gap: 6px; }
.rt-playground .rtpg-field-label { font-size: 12px; color: var(--rtpg-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.rt-playground .rtpg-field-label-row { display: flex; align-items: center; justify-content: space-between; }
.rt-playground .rtpg-select { appearance: none; background: var(--rtpg-panel-2); color: var(--rtpg-text); border: 1px solid var(--rtpg-border); border-radius: 8px; padding: 9px 12px; font-family: var(--rtpg-mono); font-size: 13px; cursor: pointer; }
.rt-playground .rtpg-select:focus { outline: none; border-color: var(--rtpg-accent-dim); }
.rt-playground .rtpg-blurb { margin: 0; color: var(--rtpg-muted); font-size: 12px; line-height: 1.45; }
.rt-playground .rtpg-input-field[hidden] { display: none; }
.rt-playground .rtpg-input-editor { height: 150px; border: 1px solid var(--rtpg-border); border-radius: 8px; overflow: hidden; }
.rt-playground .rtpg-ghost-btn { background: transparent; border: 1px solid var(--rtpg-border); color: var(--rtpg-muted); border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.rt-playground .rtpg-ghost-btn:hover { color: var(--rtpg-accent); border-color: var(--rtpg-accent-dim); }
.rt-playground .rtpg-run-btn { background: var(--rtpg-accent); color: #0e1116; border: none; border-radius: 8px; padding: 11px 14px; font-weight: 700; font-size: 14px; cursor: pointer; }
.rt-playground .rtpg-run-btn:hover { background: var(--rtpg-accent-dim); }
.rt-playground .rtpg-run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rt-playground .rtpg-status { font-family: var(--rtpg-mono); font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--rtpg-border); background: var(--rtpg-panel-2); color: var(--rtpg-muted); }
.rt-playground .rtpg-status[data-state="ready"] { color: var(--rtpg-ok); border-color: var(--rtpg-accent-dim); }
.rt-playground .rtpg-status[data-state="error"] { color: var(--rtpg-err); border-color: var(--rtpg-err); }
.rt-playground .rtpg-codeview { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* The code block fills the whole column so its background reaches the bottom no
   matter how short the code is; it scrolls internally when the code is taller. */
.rt-playground .rtpg-codeview > .rtpg-code { flex: 1; margin: 0; border: 0; border-radius: 0; }
.rt-playground .rtpg-codeview > .rtpg-loading,
.rt-playground .rtpg-codeview > .rtpg-card-note,
.rt-playground .rtpg-codeview > .rtpg-placeholder { padding: 13px; }
.rt-playground .rtpg-result-label { display: flex; align-items: baseline; justify-content: space-between; font-size: 11px; color: var(--rtpg-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.rt-playground .rtpg-result { max-height: 160px; overflow: auto; padding: 10px; border: 1px solid var(--rtpg-border); border-radius: 8px; background: var(--rtpg-bg); }
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
.rt-playground .rtpg-toolbar { display: flex; align-items: center; justify-content: flex-start; gap: 12px; flex-wrap: wrap; padding: 10px 13px; border-bottom: 1px solid var(--rtpg-border); background: var(--rtpg-panel); }
.rt-playground .rtpg-typegroup { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 5px 7px; border: 1px solid var(--rtpg-border); border-radius: 10px; background: var(--rtpg-bg); }
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
`;

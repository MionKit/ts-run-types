// config.go is the global-config reader for the CLI: it locates the nearest
// tsconfig.json walking up from a target file and parses its `compilerOptions`
// — including the `plugins[]` ts-runtypes entry — with a tolerant JSONC reader
// (comments and trailing commas stripped). The tsconfig / JSONC discovery
// helpers (findNearestTsconfig, parseTsconfig, stripJSONC, findTsRuntypesPlugin,
// tsconfigShape) are general and intended to be shared by other packages /
// consolidated later; the enrich-specific resolution (enrichConfig,
// resolveEnrichConfig, mirrorPath) rides along here for now.
package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
)

// defaultGenDirName is the conventional RunTypes output root when neither a
// --gen-dir flag nor a tsconfig `genDir` supplies one: `__runtypes` under the
// project's source root. EVERYTHING under genDir is convention, never
// configuration: `types/` (regenerated, gitignored), `enriched/friendly/`,
// `enriched/mock/`, `enriched/i18n/<locale>/` (committed).
const defaultGenDirName = "__runtypes"

// enrichedSubdir is the committed half of genDir — the enrichment mirrors live
// at <genDir>/enriched/<family>/... by convention.
const enrichedSubdir = "enriched"

// Family path segments under the enrich root. Each enrichment family owns its
// own mirror subtree (<EnrichDir>/<family>/<rel>), so one source file maps to
// one mirror file PER FAMILY: friendly/models/user.ts holds friendlyUser,
// mock/models/user.ts holds mockUser. The segment lives in the PATH (never a
// filename infix) so forceTSExt stays family-blind.
const (
	familyFriendly = "friendly"
	familyMock     = "mock"
)

// defaultI18nDirName is the translation subtree's dir name under the enrich
// root (a PARALLEL sibling of the friendly/ + mock/ family subtrees); each
// locale owns a path segment under it: <EnrichDir>/i18n/<locale>/<rel>.
const defaultI18nDirName = "i18n"

// defaultSourceLocale is the language source FriendlyText maps are assumed to
// be authored in when tsconfig `i18n.sourceLocale` is absent.
const defaultSourceLocale = "en"

// enrichConfig is the resolved enrichment configuration for a gen target. It is
// the merge of (in precedence order) the --enrich-dir CLI flag, the tsconfig
// `compilerOptions.plugins[name=ts-runtypes]` entry, and the built-in defaults.
//
// Paths are absolute and normalized to OS separators. EnrichDir is the absolute
// mirror root; RootDir is the absolute source root the mirror tree shadows;
// ProjectRoot is the directory the mirror root is resolved under (the tsconfig
// dir, or the target file's dir when no tsconfig is found).
type enrichConfig struct {
	ProjectRoot string
	RootDir     string
	EnrichDir   string

	// i18n knobs (the tsconfig plugin `i18n` object; docs/done/friendly-type-i18n.md).
	// Defaults are dormant: SourceLocale 'en', I18nDir <EnrichDir>/i18n, no
	// locales, lenient check.
	SourceLocale string
	I18nDir      string
	I18nLocales  []string
	I18nStrict   bool

	// The remaining plugin options are read and stored for completeness (and
	// future use) but are not acted on by gen yet.
	ModuleMode string
	EmitMode   string
	InlineMode string
}

// tsRuntypesPlugin is the shape of the `ts-runtypes` entry under
// compilerOptions.plugins[]. It is the single canonical config surface for the
// Go compiler's project tunables; the host plugins (ts-runtypes-devtools) forward
// only host-specific knobs (binary path, cwd) plus any explicit per-build
// override. Unknown keys are ignored.
//
// The string knobs (enrichDir / moduleMode / emitMode / inlineMode) decode to
// their zero value when absent; the build-path knobs below use POINTERS so an
// absent key (nil) is distinguishable from an explicit false / 0 — the merge in
// buildconfig.go only overrides a binary default when the key is actually
// present.
type tsRuntypesPlugin struct {
	Name string `json:"name"`
	// GenDir is the RunTypes output root; every location under it is
	// convention (types/, enriched/{friendly,mock,i18n}) and NOT configurable.
	GenDir     string `json:"genDir"`
	ModuleMode string `json:"moduleMode"`
	EmitMode   string `json:"emitMode"`
	InlineMode string `json:"inlineMode"`

	// I18n is the FriendlyText translation config. A pointer so an absent key
	// (nil) keeps every i18n default dormant.
	I18n *i18nPluginConfig `json:"i18n"`

	// Build-path project knobs, read by resolveBuildPlugin and merged in
	// buildconfig.go. The enrichment path ignores them.
	//
	// NB: there is deliberately NO cacheDir key. The RT disk cache follows
	// TypeScript's own `incremental` / `composite` switch (on when the project
	// is incremental, off otherwise) rather than a knob of ours; the internal
	// RT_CACHE_DIR env var overrides it for tests / direct-binary power users.
	HashLength     *int  `json:"hashLength"`
	SingleThreaded *bool `json:"singleThreaded"`
	ParallelScan   *bool `json:"parallelScan"`
	ParallelRender *bool `json:"parallelRender"`
	// AllowUncheckedPatterns silences the fail-closed FMT004 build error for
	// format patterns whose mockSamples RE2 can't verify (JS-only regex
	// features), asserting the ts-runtypes JS linter owns that check. A pointer
	// so an absent key falls through to the false default. Build-lane only.
	AllowUncheckedPatterns *bool `json:"allowUncheckedPatterns"`
	// PureFnReport is the pure-fn build report switch, a `true | "<path>"`
	// union: `true` emits the report AND writes it to the default
	// `<genDir>/pure-fns-report.json`; a string writes it to that path; absent /
	// false keeps it off. Decoded as RawMessage because the value is a union
	// (bool or string); parsePureFnReport interprets it. Build-lane project
	// option — the host plugin forwards the equivalent CLI flags.
	PureFnReport json.RawMessage `json:"pureFnReport"`
	// Size groups the binary `dynamic` strategy's cold-start buffer-estimate
	// knobs under one `size` object (like `i18n`). A nil object (absent key)
	// keeps every binary default.
	Size *sizePluginConfig `json:"size"`
}

// parsePureFnReport interprets the tsconfig `pureFnReport` union value:
//   - `true`      → (enabled=true, file=true, path="")  — write the default-path file
//   - `"<path>"`  → (enabled=true, file=false, path)    — write that explicit path
//   - absent / false / null / "" → (false, false, "")   — off
//
// A file/path implies the report data too (the merge folds that in). Any other
// shape is treated as off rather than erroring — an unknown value should never
// break a build.
func parsePureFnReport(raw json.RawMessage) (enabled, file bool, path string) {
	trimmed := strings.TrimSpace(string(raw))
	switch trimmed {
	case "", "null", "false":
		return false, false, ""
	case "true":
		return true, true, ""
	}
	var asPath string
	if err := json.Unmarshal(raw, &asPath); err == nil {
		if asPath = strings.TrimSpace(asPath); asPath != "" {
			return true, false, asPath
		}
	}
	return false, false, ""
}

// sizePluginConfig is the `size` object under the ts-runtypes plugin entry:
//
//	{ "bias": 0.8, "items": 100, "stringBytes": 32, "maxBytes": 65536 }
//
// bias (0..1) tunes how generous the first buffer is; items / stringBytes are
// the assumed magnitudes for unbounded collections and strings; maxBytes caps
// the estimate. Pointers so an absent key falls through to the binary default.
type sizePluginConfig struct {
	Bias        *float64 `json:"bias"`
	Items       *int     `json:"items"`
	StringBytes *int     `json:"stringBytes"`
	MaxBytes    *int     `json:"maxBytes"`
}

// i18nPluginConfig is the `i18n` object under the ts-runtypes plugin entry:
//
//	{ "sourceLocale": "en", "dir": "runtypes/generated/i18n",
//	  "locales": ["es", "pl"], "formats": "runtypes/i18n.formats.ts",
//	  "strict": false }
//
// sourceLocale names the language the source FriendlyText maps are authored in
// (it selects the plural arms the scaffold emits). dir is the translation
// subtree root (locale is a PATH SEGMENT under it), resolved like enrichDir
// (relative → under the project root); default <enrichDir>/i18n. locales is
// the target set — the source locale is NOT listed. strict turns
// `check --translate` findings into errors; the runtime is always lenient.
type i18nPluginConfig struct {
	SourceLocale string   `json:"sourceLocale"`
	Locales      []string `json:"locales"`
	Strict       bool     `json:"strict"`
}

// tsconfigShape decodes only the compilerOptions fields enrichment reads.
type tsconfigShape struct {
	CompilerOptions struct {
		RootDir string            `json:"rootDir"`
		Plugins []json.RawMessage `json:"plugins"`
	} `json:"compilerOptions"`
}

// resolveEnrichConfig computes the enrichment config for a gen target file.
// enrichDirFlag is the --enrich-dir CLI value (empty when unset) and takes
// precedence over the tsconfig entry, which takes precedence over the default.
//
// It walks up from absTargetFile's directory to the nearest tsconfig.json. When
// found, ProjectRoot is the tsconfig dir, RootDir is compilerOptions.rootDir
// (resolved against the tsconfig dir; defaulting to the tsconfig dir when
// unset), and EnrichDir comes from the plugins entry (defaulting to
// defaultEnrichDir). When no tsconfig is found, ProjectRoot and RootDir both
// default to the target file's directory and EnrichDir to the default.
//
// A missing or malformed tsconfig falls back to the no-tsconfig defaults — it
// never errors.
func resolveEnrichConfig(absTargetFile, genDirFlag string) enrichConfig {
	targetDir := filepath.Dir(absTargetFile)

	config := enrichConfig{
		ProjectRoot:  targetDir,
		RootDir:      targetDir,
		SourceLocale: defaultSourceLocale,
	}

	genDir := ""
	if tsconfigPath := findNearestTsconfig(targetDir); tsconfigPath != "" {
		tsconfigDir := filepath.Dir(tsconfigPath)
		config.ProjectRoot = tsconfigDir
		config.RootDir = tsconfigDir

		if parsed, ok := parseTsconfig(tsconfigPath); ok {
			if rootDir := strings.TrimSpace(parsed.CompilerOptions.RootDir); rootDir != "" {
				config.RootDir = resolveUnder(tsconfigDir, rootDir)
			}
			if plugin, ok := findTsRuntypesPlugin(parsed); ok {
				genDir = strings.TrimSpace(plugin.GenDir)
				config.ModuleMode = plugin.ModuleMode
				config.EmitMode = plugin.EmitMode
				config.InlineMode = plugin.InlineMode
				if plugin.I18n != nil {
					if sourceLocale := strings.TrimSpace(plugin.I18n.SourceLocale); sourceLocale != "" {
						config.SourceLocale = sourceLocale
					}
					config.I18nLocales = plugin.I18n.Locales
					config.I18nStrict = plugin.I18n.Strict
				}
			}
		}
	}

	// genDir resolution: the --gen-dir flag wins, then tsconfig `genDir`, then
	// the convention default `__runtypes` under the source root. Everything
	// BELOW genDir is convention, never configuration: mirrors live at
	// <genDir>/enriched/<family>/... and translations at
	// <genDir>/enriched/i18n/<locale>/... (see mirrorPath / translationPathFor).
	if flagValue := strings.TrimSpace(genDirFlag); flagValue != "" {
		genDir = flagValue
	}
	if genDir != "" {
		genDir = resolveUnder(config.ProjectRoot, genDir)
	} else {
		genDir = filepath.Join(config.RootDir, defaultGenDirName)
	}
	config.EnrichDir = filepath.Join(genDir, enrichedSubdir)
	config.I18nDir = filepath.Join(config.EnrichDir, defaultI18nDirName)

	return config
}

// ensureFamilyReadme self-documents an enrichment family dir (or the i18n
// translation root) the moment it is created: every conventional dir under
// genDir carries a README explaining what it is. Write-if-absent so an edit is
// never clobbered; best-effort (a failure surfaces on the mirror write itself).
func (config enrichConfig) ensureFamilyReadme(family string) {
	texts := map[string][2]string{
		familyFriendly: {filepath.Join(config.EnrichDir, familyFriendly),
			"# FriendlyText mirrors\n\nHuman-facing labels and error messages for your types, one mirror file per\nsource file. Scaffolded and kept in sync by `ts-runtypes gen`; the values are\nyours to edit. Commit these files.\n"},
		familyMock: {filepath.Join(config.EnrichDir, familyMock),
			"# MockData mirrors\n\nRealistic sample pools and ranges for your types, one mirror file per source\nfile. Scaffolded and kept in sync by `ts-runtypes gen`; the values are yours\nto edit. Commit these files.\n"},
		defaultI18nDirName: {config.I18nDir,
			"# Translations\n\nPer-locale translations of the FriendlyText mirrors, one folder per locale.\nManaged with `ts-runtypes gen --translate`. Commit these files.\n"},
	}
	entry, ok := texts[family]
	if !ok {
		return
	}
	dir, text := entry[0], entry[1]
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return
	}
	readme := filepath.Join(dir, "README.md")
	if _, err := os.Stat(readme); err == nil {
		return
	}
	_ = os.WriteFile(readme, []byte(text), 0o644)
}

// mirrorPath computes one family's mirror file for a source file under this
// config: <EnrichDir>/<family>/<absSourceFile relative to RootDir>, with the
// extension forced to ".ts" (a .d.ts source maps to a plain .ts mirror, which
// holds runtime consts). When absSourceFile is not under RootDir (filepath.Rel
// escapes with ".."), it falls back to the source's base name directly under
// the family dir so the mirror never lands outside the tree.
func (config enrichConfig) mirrorPath(family, absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, family, config.mirrorRel(absSourceFile)))
}

// legacyMirrorPath is the pre-split COMBINED mirror location (no family
// segment) a source file used to map to. Read-only: gen consults it solely to
// migrate an old combined mirror into the per-family files (see
// migrateLegacyMirror); nothing is ever written there again.
func (config enrichConfig) legacyMirrorPath(absSourceFile string) string {
	return filepath.Clean(filepath.Join(config.EnrichDir, config.mirrorRel(absSourceFile)))
}

// mirrorRel is the source file's mirror-relative sub-path: relative to RootDir
// (base name when outside it), extension forced to ".ts".
func (config enrichConfig) mirrorRel(absSourceFile string) string {
	rel, err := filepath.Rel(config.RootDir, absSourceFile)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(absSourceFile)
	}
	return forceTSExt(rel)
}

// translationPathFor computes one locale's translation file for a friendly
// source mirror: <I18nDir>/<locale>/<mirror's path relative to the friendly
// family root>. The locale is a PATH SEGMENT (never a filename infix), so
// forceTSExt never sees it and a region tag like pt-BR needs no re-parse.
func (config enrichConfig) translationPathFor(locale, friendlyMirrorPath string) string {
	friendlyRoot := filepath.Join(config.EnrichDir, familyFriendly)
	rel, err := filepath.Rel(friendlyRoot, friendlyMirrorPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		rel = filepath.Base(friendlyMirrorPath)
	}
	return filepath.Clean(filepath.Join(config.I18nDir, locale, rel))
}

// forceTSExt replaces a source file's extension with ".ts", collapsing a ".d.ts"
// to ".ts" too (the mirror is always a runtime .ts file).
func forceTSExt(path string) string {
	trimmed := strings.TrimSuffix(path, ".d.ts")
	if trimmed == path {
		trimmed = strings.TrimSuffix(path, filepath.Ext(path))
	}
	return trimmed + ".ts"
}

// resolveUnder joins path under base when path is relative, else returns path
// cleaned. The result is OS-separator normalized.
func resolveUnder(base, path string) string {
	if filepath.IsAbs(path) {
		return filepath.Clean(path)
	}
	return filepath.Clean(filepath.Join(base, path))
}

// findNearestTsconfig walks up from startDir looking for a tsconfig.json,
// returning its absolute path or "" if none is found before the filesystem root.
func findNearestTsconfig(startDir string) string {
	dir := startDir
	for {
		candidate := filepath.Join(dir, "tsconfig.json")
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// parseTsconfig reads and tolerantly parses a JSONC tsconfig.json (comments +
// trailing commas stripped). Returns ok=false on read or parse failure so the
// caller falls back to defaults.
func parseTsconfig(tsconfigPath string) (tsconfigShape, bool) {
	var parsed tsconfigShape
	raw, err := os.ReadFile(tsconfigPath)
	if err != nil {
		return parsed, false
	}
	cleaned := stripJSONC(string(raw))
	if err := json.Unmarshal([]byte(cleaned), &parsed); err != nil {
		return parsed, false
	}
	return parsed, true
}

// findTsRuntypesPlugin scans compilerOptions.plugins[] for the entry whose
// "name" is "ts-runtypes". Entries that fail to decode are skipped.
func findTsRuntypesPlugin(parsed tsconfigShape) (tsRuntypesPlugin, bool) {
	for _, raw := range parsed.CompilerOptions.Plugins {
		var plugin tsRuntypesPlugin
		if err := json.Unmarshal(raw, &plugin); err != nil {
			continue
		}
		if plugin.Name == "ts-runtypes" {
			return plugin, true
		}
	}
	return tsRuntypesPlugin{}, false
}

// resolveBuildPlugin reads the compilerOptions.plugins[name=ts-runtypes] entry
// from the build path's tsconfig — the same file program.New loads in the
// default (on-disk tsconfig) mode. Returns ok=false when no tsconfig resolves
// or it carries no ts-runtypes entry; the build path then runs on CLI flags +
// binary defaults alone (the inline / server modes have no tsconfig, and a
// project may simply never add the plugin entry).
//
// tsconfigFlag is the --tsconfig CLI value (empty → <absCwd>/tsconfig.json),
// matching program.New's own resolution so the binary reads the very tsconfig
// it compiles against. A missing or malformed tsconfig returns ok=false rather
// than erroring — same tolerant contract as resolveEnrichConfig.
func resolveBuildPlugin(absCwd, tsconfigFlag string) (tsRuntypesPlugin, bool) {
	parsed, ok := parseTsconfig(buildTsconfigPath(absCwd, tsconfigFlag))
	if !ok {
		return tsRuntypesPlugin{}, false
	}
	return findTsRuntypesPlugin(parsed)
}

// buildTsconfigPath resolves the build path's tsconfig location the same way
// program.New does: the --tsconfig value (anchored under absCwd when relative),
// or <absCwd>/tsconfig.json when unset.
func buildTsconfigPath(absCwd, tsconfigFlag string) string {
	tsconfigPath := strings.TrimSpace(tsconfigFlag)
	if tsconfigPath == "" {
		return filepath.Join(absCwd, "tsconfig.json")
	}
	if !filepath.IsAbs(tsconfigPath) {
		return filepath.Join(absCwd, tsconfigPath)
	}
	return tsconfigPath
}

// knownPluginKeys is the set of JSON keys the ts-runtypes plugin entry
// recognises, derived by reflection from tsRuntypesPlugin's json tags so it can
// never drift from the struct. Used to warn on a likely-typo'd key.
var knownPluginKeys = func() map[string]bool {
	keys := map[string]bool{}
	pluginType := reflect.TypeOf(tsRuntypesPlugin{})
	for i := 0; i < pluginType.NumField(); i++ {
		tag := pluginType.Field(i).Tag.Get("json")
		if name, _, _ := strings.Cut(tag, ","); name != "" && name != "-" {
			keys[name] = true
		}
	}
	return keys
}()

// unknownPluginKeys returns the keys in the ts-runtypes plugin entry that the
// build path does not recognise (sorted) — almost always a typo. Empty when no
// tsconfig resolves, it is malformed, or it has no ts-runtypes entry, so a
// project without the plugin never warns. The build path surfaces these on
// stderr; an unknown key is otherwise silently ignored.
func unknownPluginKeys(absCwd, tsconfigFlag string) []string {
	raw, err := os.ReadFile(buildTsconfigPath(absCwd, tsconfigFlag))
	if err != nil {
		return nil
	}
	var parsed struct {
		CompilerOptions struct {
			Plugins []map[string]json.RawMessage `json:"plugins"`
		} `json:"compilerOptions"`
	}
	if json.Unmarshal([]byte(stripJSONC(string(raw))), &parsed) != nil {
		return nil
	}
	for _, entry := range parsed.CompilerOptions.Plugins {
		var name string
		if json.Unmarshal(entry["name"], &name) != nil || name != "ts-runtypes" {
			continue
		}
		var unknown []string
		for key := range entry {
			if !knownPluginKeys[key] {
				unknown = append(unknown, key)
			}
		}
		sort.Strings(unknown)
		return unknown
	}
	return nil
}

// stripJSONC removes // line comments, /* block */ comments, and trailing
// commas from a JSONC document, leaving valid JSON. It is string/escape aware so
// a `//` or `,` inside a string literal is preserved. This is intentionally
// minimal — robustness over completeness; a tsconfig it cannot clean simply
// fails json.Unmarshal and the caller falls back to defaults.
func stripJSONC(input string) string {
	var out strings.Builder
	out.Grow(len(input))

	inString := false
	inLineComment := false
	inBlockComment := false
	escaped := false

	for i := 0; i < len(input); i++ {
		current := input[i]

		if inLineComment {
			if current == '\n' {
				inLineComment = false
				out.WriteByte(current)
			}
			continue
		}
		if inBlockComment {
			if current == '*' && i+1 < len(input) && input[i+1] == '/' {
				inBlockComment = false
				i++
			}
			continue
		}
		if inString {
			out.WriteByte(current)
			if escaped {
				escaped = false
			} else if current == '\\' {
				escaped = true
			} else if current == '"' {
				inString = false
			}
			continue
		}

		// Not in a string or comment.
		switch {
		case current == '"':
			inString = true
			out.WriteByte(current)
		case current == '/' && i+1 < len(input) && input[i+1] == '/':
			inLineComment = true
			i++
		case current == '/' && i+1 < len(input) && input[i+1] == '*':
			inBlockComment = true
			i++
		case current == ',':
			// Drop a trailing comma: a comma followed (after whitespace) by a
			// closing } or ]. Otherwise keep it.
			if isTrailingComma(input, i+1) {
				continue
			}
			out.WriteByte(current)
		default:
			out.WriteByte(current)
		}
	}
	return out.String()
}

// isTrailingComma reports whether the next non-whitespace byte at or after pos
// is a closing brace or bracket (so the preceding comma is a trailing comma).
func isTrailingComma(input string, pos int) bool {
	for i := pos; i < len(input); i++ {
		switch input[i] {
		case ' ', '\t', '\r', '\n':
			continue
		case '}', ']':
			return true
		default:
			return false
		}
	}
	return false
}

// buildconfig.go layers the build path's effective resolver options from two
// sources, tsc-style: a command-line flag overrides the tsconfig plugin entry,
// which overrides the binary's built-in default. The host plugins
// (ts-runtypes-devtools) forward a --flag ONLY for an option the user set
// explicitly, so an unset host option falls through to the tsconfig entry.
package main

import (
	"path/filepath"
	"strings"
)

// buildFlags carries the raw build-path CLI flag values plus the set of flag
// names the user actually passed (flag.Visit). "set" is what lets the merge
// tell an explicit `--single-threaded=false` from an absent flag, so tsconfig
// only fills the gaps the command line left.
type buildFlags struct {
	set                    map[string]bool
	hashLength             int
	singleThreaded         bool
	noParallelScan         bool
	noParallelRender       bool
	runTypesGenDir         string
	emitMode               string
	inlineMode             string
	moduleMode             string
	allowUncheckedPatterns bool
	sizeBias               float64
	sizeItems              int
	sizeStringBytes        int
	sizeMaxBytes           int
}

// buildOptions is the merged build configuration the resolver consumes.
type buildOptions struct {
	hashLength             int
	singleThreaded         bool
	disableParallelScan    bool
	disableParallelRender  bool
	runTypesGenDir         string
	emitMode               string
	inlineMode             string
	moduleMode             string
	allowUncheckedPatterns bool
	sizeBias               float64
	sizeItems              int
	sizeStringBytes        int
	sizeMaxBytes           int
}

// mergeBuildOptions resolves the effective build configuration from the CLI
// flags and the tsconfig plugin entry. Precedence (highest first): an
// explicitly-set flag, then the tsconfig plugin entry, then the binary default
// the flag already carries. absCwd anchors relative path values (runTypesGenDir).
// The RT disk cache is NOT resolved here — it follows the project's incremental
// setting (see resolver.Options.CacheFollowsIncremental) with the internal
// RT_CACHE_DIR env override applied in main.go.
func mergeBuildOptions(flags buildFlags, plugin tsRuntypesPlugin, absCwd string) buildOptions {
	// emit / inline / module-mode flags are declared with the binary default
	// as their flag default, so an unset flag already holds the default; a
	// present tsconfig value overrides only when the flag was not passed.
	out := buildOptions{
		hashLength:             flags.hashLength,
		singleThreaded:         flags.singleThreaded,
		emitMode:               flags.emitMode,
		inlineMode:             flags.inlineMode,
		moduleMode:             flags.moduleMode,
		allowUncheckedPatterns: flags.allowUncheckedPatterns,
		sizeBias:               flags.sizeBias,
		sizeItems:              flags.sizeItems,
		sizeStringBytes:        flags.sizeStringBytes,
		sizeMaxBytes:           flags.sizeMaxBytes,
	}

	if !flags.set["emit-mode"] && strings.TrimSpace(plugin.EmitMode) != "" {
		out.emitMode = strings.TrimSpace(plugin.EmitMode)
	}
	if !flags.set["inline-mode"] && strings.TrimSpace(plugin.InlineMode) != "" {
		out.inlineMode = strings.TrimSpace(plugin.InlineMode)
	}
	if !flags.set["module-mode"] && strings.TrimSpace(plugin.ModuleMode) != "" {
		out.moduleMode = strings.TrimSpace(plugin.ModuleMode)
	}
	if !flags.set["hash-length"] && plugin.HashLength != nil {
		out.hashLength = *plugin.HashLength
	}
	if !flags.set["single-threaded"] && plugin.SingleThreaded != nil {
		out.singleThreaded = *plugin.SingleThreaded
	}
	if !flags.set["allow-unchecked-patterns"] && plugin.AllowUncheckedPatterns != nil {
		out.allowUncheckedPatterns = *plugin.AllowUncheckedPatterns
	}

	// Size-estimate knobs: a tsconfig value fills in only when the flag was not
	// explicitly passed (the flag already carries the binary default).
	if !flags.set["size-bias"] && plugin.SizeBias != nil {
		out.sizeBias = *plugin.SizeBias
	}
	if !flags.set["size-items"] && plugin.SizeItems != nil {
		out.sizeItems = *plugin.SizeItems
	}
	if !flags.set["size-string-bytes"] && plugin.SizeStringBytes != nil {
		out.sizeStringBytes = *plugin.SizeStringBytes
	}
	if !flags.set["size-max-bytes"] && plugin.SizeMaxBytes != nil {
		out.sizeMaxBytes = *plugin.SizeMaxBytes
	}

	// parallelScan / parallelRender read true=on (matching the host plugin's
	// PluginOptions); the flags are the inverted --no-parallel-* opt-outs.
	out.disableParallelScan = flags.noParallelScan
	if !flags.set["no-parallel-scan"] && plugin.ParallelScan != nil {
		out.disableParallelScan = !*plugin.ParallelScan
	}
	out.disableParallelRender = flags.noParallelRender
	if !flags.set["no-parallel-render"] && plugin.ParallelRender != nil {
		out.disableParallelRender = !*plugin.ParallelRender
	}

	out.runTypesGenDir = resolveRunTypesGenDir(flags, plugin, absCwd)
	return out
}

// resolveRunTypesGenDir layers where `--compile` writes its cache modules: an
// explicit --run-types-gen-dir flag wins, then the tsconfig `runTypesGenDir`
// entry, then the <cwd>/__runtypes default. Relative values resolve under
// absCwd. Unlike cacheDir there is no disable state — compile always needs an
// output location — so an empty explicit value falls through to the default.
func resolveRunTypesGenDir(flags buildFlags, plugin tsRuntypesPlugin, absCwd string) string {
	value := ""
	switch {
	case flags.set["run-types-gen-dir"]:
		value = strings.TrimSpace(flags.runTypesGenDir)
	case plugin.RunTypesGenDir != nil:
		value = strings.TrimSpace(*plugin.RunTypesGenDir)
	}
	if value == "" {
		value = filepath.Join(absCwd, "__runtypes")
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(absCwd, value)
	}
	return value
}

// normalizeCacheDir resolves the internal RT_CACHE_DIR override value to an
// absolute path (empty stays empty — an explicit disable). Relative values
// anchor under absCwd, matching how runTypesGenDir resolves.
func normalizeCacheDir(value, absCwd string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(absCwd, value)
	}
	return value
}

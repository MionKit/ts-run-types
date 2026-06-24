// buildconfig.go layers the build path's effective resolver options from two
// sources, tsc-style: a command-line flag overrides the tsconfig plugin entry,
// which overrides the binary's built-in default. The host plugins
// (runtypes-devtools) forward a --flag ONLY for an option the user set
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
	set              map[string]bool
	hashLength       int
	singleThreaded   bool
	noParallelScan   bool
	noParallelRender bool
	cacheDir         string
	emitMode         string
	inlineMode       string
	moduleMode       string
	sizeBias         float64
	sizeItems        int
	sizeStringBytes  int
	sizeMaxBytes     int
}

// buildOptions is the merged build configuration the resolver consumes.
type buildOptions struct {
	hashLength            int
	singleThreaded        bool
	disableParallelScan   bool
	disableParallelRender bool
	cacheDir              string
	emitMode              string
	inlineMode            string
	moduleMode            string
	sizeBias              float64
	sizeItems             int
	sizeStringBytes       int
	sizeMaxBytes          int
}

// mergeBuildOptions resolves the effective build configuration from the CLI
// flags and the tsconfig plugin entry. Precedence (highest first): an
// explicitly-set flag, then the tsconfig plugin entry, then the binary default
// the flag already carries. hasTsconfig is true only in the on-disk-tsconfig
// mode (program.New); it gates the node_modules cache default so the inline /
// server test modes stay cache-off unless a flag turns caching on. absCwd
// anchors relative cacheDir values.
func mergeBuildOptions(flags buildFlags, plugin tsRuntypesPlugin, hasTsconfig bool, absCwd string) buildOptions {
	// emit / inline / module-mode flags are declared with the binary default
	// as their flag default, so an unset flag already holds the default; a
	// present tsconfig value overrides only when the flag was not passed.
	out := buildOptions{
		hashLength:      flags.hashLength,
		singleThreaded:  flags.singleThreaded,
		emitMode:        flags.emitMode,
		inlineMode:      flags.inlineMode,
		moduleMode:      flags.moduleMode,
		sizeBias:        flags.sizeBias,
		sizeItems:       flags.sizeItems,
		sizeStringBytes: flags.sizeStringBytes,
		sizeMaxBytes:    flags.sizeMaxBytes,
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

	out.cacheDir = resolveCacheDir(flags, plugin, hasTsconfig, absCwd)
	return out
}

// resolveCacheDir layers the cache location: an explicit --cache-dir flag wins
// (an explicit empty value disables caching); then the tsconfig cacheDir; then,
// only in the on-disk-tsconfig mode, the canonical
// <cwd>/node_modules/.cache/ts-runtypes default the host plugin used to inject.
// Relative values resolve under absCwd. An empty result disables caching.
func resolveCacheDir(flags buildFlags, plugin tsRuntypesPlugin, hasTsconfig bool, absCwd string) string {
	value := ""
	switch {
	case flags.set["cache-dir"]:
		value = strings.TrimSpace(flags.cacheDir)
	case plugin.CacheDir != nil:
		value = strings.TrimSpace(*plugin.CacheDir)
	case hasTsconfig:
		value = filepath.Join(absCwd, "node_modules", ".cache", "ts-runtypes")
	}
	if value == "" {
		return ""
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(absCwd, value)
	}
	return value
}

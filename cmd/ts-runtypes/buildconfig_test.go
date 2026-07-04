package main

import (
	"path/filepath"
	"testing"
)

// intPtr / boolPtr / strPtr build the pointer fields of a tsRuntypesPlugin —
// a present key vs the nil "absent" the merge must leave alone.
func intPtr(v int) *int       { return &v }
func boolPtr(v bool) *bool    { return &v }
func strPtr(v string) *string { return &v }

// baseFlags returns build flags as the binary declares them with nothing set —
// the flag defaults that double as the binary defaults.
func baseFlags() buildFlags {
	return buildFlags{
		set:        map[string]bool{},
		hashLength: 0,
		emitMode:   "code",
		inlineMode: "default",
		moduleMode: "default",
	}
}

// TestMergeBuildOptions_DefaultsWhenEmpty: no flags, no plugin entry, inline
// mode (hasTsconfig=false) yields exactly the binary defaults — caching off.
func TestMergeBuildOptions_DefaultsWhenEmpty(t *testing.T) {
	got := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{}, false, "/proj")
	want := buildOptions{
		hashLength: 0, emitMode: "code", inlineMode: "default", moduleMode: "default",
		runTypesGenDir: filepath.Join("/proj", "__runtypes"),
	}
	if got != want {
		t.Errorf("merge defaults = %+v, want %+v", got, want)
	}
}

// TestMergeBuildOptions_TsconfigFillsGaps: with no flags set, every tsconfig
// value flows through.
func TestMergeBuildOptions_TsconfigFillsGaps(t *testing.T) {
	plugin := tsRuntypesPlugin{
		EmitMode:       "both",
		InlineMode:     "allInternal",
		ModuleMode:     "allSingle",
		HashLength:     intPtr(9),
		SingleThreaded: boolPtr(true),
		ParallelScan:   boolPtr(false),
		ParallelRender: boolPtr(false),
		CacheDir:       strPtr("/abs/cache"),
	}
	got := mergeBuildOptions(baseFlags(), plugin, true, "/proj")
	want := buildOptions{
		hashLength:            9,
		singleThreaded:        true,
		disableParallelScan:   true,
		disableParallelRender: true,
		cacheDir:              "/abs/cache",
		runTypesGenDir:        filepath.Join("/proj", "__runtypes"),
		emitMode:              "both",
		inlineMode:            "allInternal",
		moduleMode:            "allSingle",
	}
	if got != want {
		t.Errorf("merge from tsconfig = %+v, want %+v", got, want)
	}
}

// TestResolveRunTypesGenDir covers the three layers: flag > tsconfig > the
// <cwd>/__runtypes default (there is no disable state — compile always emits).
func TestResolveRunTypesGenDir(t *testing.T) {
	defaultDir := filepath.Join("/proj", "__runtypes")
	tests := []struct {
		name   string
		flags  buildFlags
		plugin tsRuntypesPlugin
		want   string
	}{
		{"nothing set uses the default", baseFlags(), tsRuntypesPlugin{}, defaultDir},
		{"tsconfig absolute wins over default", baseFlags(), tsRuntypesPlugin{RunTypesGenDir: strPtr("/abs/rt")}, "/abs/rt"},
		{"tsconfig relative anchors under cwd", baseFlags(), tsRuntypesPlugin{RunTypesGenDir: strPtr("gen/rt")}, filepath.Join("/proj", "gen/rt")},
		{"tsconfig empty falls through to default", baseFlags(), tsRuntypesPlugin{RunTypesGenDir: strPtr("")}, defaultDir},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveRunTypesGenDir(test.flags, test.plugin, "/proj"); got != test.want {
				t.Errorf("resolveRunTypesGenDir = %q, want %q", got, test.want)
			}
		})
	}

	// An explicit --run-types-gen-dir flag wins over the tsconfig value.
	flags := baseFlags()
	flags.set["run-types-gen-dir"] = true
	flags.runTypesGenDir = "/flag/rt"
	if got := resolveRunTypesGenDir(flags, tsRuntypesPlugin{RunTypesGenDir: strPtr("/abs/rt")}, "/proj"); got != "/flag/rt" {
		t.Errorf("flag runTypesGenDir should win, got %q", got)
	}
}

// TestMergeBuildOptions_FlagOverridesTsconfig: an explicitly-set flag wins over
// the tsconfig value (tsc precedence), and an unset sibling still reads tsconfig.
func TestMergeBuildOptions_FlagOverridesTsconfig(t *testing.T) {
	flags := baseFlags()
	flags.set["emit-mode"] = true
	flags.emitMode = "functions"
	flags.set["hash-length"] = true
	flags.hashLength = 5
	flags.set["single-threaded"] = true
	flags.singleThreaded = true

	plugin := tsRuntypesPlugin{
		EmitMode:       "both",      // shadowed by the flag
		ModuleMode:     "allSingle", // no flag → wins
		HashLength:     intPtr(9),   // shadowed by the flag
		SingleThreaded: boolPtr(false),
	}
	got := mergeBuildOptions(flags, plugin, true, "/proj")
	if got.emitMode != "functions" {
		t.Errorf("emitMode = %q, want flag value functions", got.emitMode)
	}
	if got.hashLength != 5 {
		t.Errorf("hashLength = %d, want flag value 5", got.hashLength)
	}
	if !got.singleThreaded {
		t.Errorf("singleThreaded = false, want flag value true")
	}
	if got.moduleMode != "allSingle" {
		t.Errorf("moduleMode = %q, want tsconfig value allSingle", got.moduleMode)
	}
}

// TestMergeBuildOptions_ParallelInversion: tsconfig parallelScan:true means
// parallel-on (disable=false); :false means the serial path.
func TestMergeBuildOptions_ParallelInversion(t *testing.T) {
	on := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{ParallelScan: boolPtr(true), ParallelRender: boolPtr(true)}, true, "/proj")
	if on.disableParallelScan || on.disableParallelRender {
		t.Errorf("parallel:true should leave disable=false, got %+v", on)
	}
	off := mergeBuildOptions(baseFlags(), tsRuntypesPlugin{ParallelScan: boolPtr(false), ParallelRender: boolPtr(false)}, true, "/proj")
	if !off.disableParallelScan || !off.disableParallelRender {
		t.Errorf("parallel:false should set disable=true, got %+v", off)
	}
	// An explicit --no-parallel-scan flag wins over tsconfig parallelScan:true.
	flags := baseFlags()
	flags.set["no-parallel-scan"] = true
	flags.noParallelScan = true
	mixed := mergeBuildOptions(flags, tsRuntypesPlugin{ParallelScan: boolPtr(true)}, true, "/proj")
	if !mixed.disableParallelScan {
		t.Errorf("--no-parallel-scan flag should win over tsconfig parallelScan:true")
	}
}

// TestResolveCacheDir covers the three cache layers + the node_modules default.
func TestResolveCacheDir(t *testing.T) {
	nodeModulesDefault := filepath.Join("/proj", "node_modules", ".cache", "ts-runtypes")
	tests := []struct {
		name        string
		flags       buildFlags
		plugin      tsRuntypesPlugin
		hasTsconfig bool
		want        string
	}{
		{"inline mode, nothing set, caching off", baseFlags(), tsRuntypesPlugin{}, false, ""},
		{"tsconfig mode default node_modules", baseFlags(), tsRuntypesPlugin{}, true, nodeModulesDefault},
		{"tsconfig cacheDir absolute", baseFlags(), tsRuntypesPlugin{CacheDir: strPtr("/abs/c")}, true, "/abs/c"},
		{"tsconfig cacheDir relative anchors under cwd", baseFlags(), tsRuntypesPlugin{CacheDir: strPtr(".cache/rt")}, true, filepath.Join("/proj", ".cache/rt")},
		{"tsconfig cacheDir empty disables even in tsconfig mode", baseFlags(), tsRuntypesPlugin{CacheDir: strPtr("")}, true, ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := resolveCacheDir(test.flags, test.plugin, test.hasTsconfig, "/proj"); got != test.want {
				t.Errorf("resolveCacheDir = %q, want %q", got, test.want)
			}
		})
	}

	// An explicit --cache-dir flag wins; an explicit empty flag disables.
	flags := baseFlags()
	flags.set["cache-dir"] = true
	flags.cacheDir = "/flag/c"
	if got := resolveCacheDir(flags, tsRuntypesPlugin{CacheDir: strPtr("/abs/c")}, true, "/proj"); got != "/flag/c" {
		t.Errorf("flag cacheDir should win, got %q", got)
	}
	flags.cacheDir = ""
	if got := resolveCacheDir(flags, tsRuntypesPlugin{CacheDir: strPtr("/abs/c")}, true, "/proj"); got != "" {
		t.Errorf("explicit empty --cache-dir should disable, got %q", got)
	}
}

// TestResolveBuildPlugin reads the ts-runtypes entry from an on-disk tsconfig,
// including the new pointer-typed build knobs, and tolerates a missing file.
func TestResolveBuildPlugin(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  // build knobs
  "compilerOptions": {
    "plugins": [
      { "name": "other" },
      {
        "name": "ts-runtypes",
        "emitMode": "both",
        "moduleMode": "allSingle",
        "hashLength": 9,
        "singleThreaded": true,
        "parallelScan": false,
        "cacheDir": ".cache/rt",
        "runTypesGenDir": "gen/rt",
      },
    ],
  },
}`)

	plugin, ok := resolveBuildPlugin(dir, "")
	if !ok {
		t.Fatal("resolveBuildPlugin ok=false, want true")
	}
	if plugin.EmitMode != "both" || plugin.ModuleMode != "allSingle" {
		t.Errorf("string knobs: %+v", plugin)
	}
	if plugin.HashLength == nil || *plugin.HashLength != 9 {
		t.Errorf("hashLength pointer = %v, want 9", plugin.HashLength)
	}
	if plugin.SingleThreaded == nil || !*plugin.SingleThreaded {
		t.Errorf("singleThreaded pointer = %v, want true", plugin.SingleThreaded)
	}
	if plugin.ParallelScan == nil || *plugin.ParallelScan {
		t.Errorf("parallelScan pointer = %v, want false", plugin.ParallelScan)
	}
	if plugin.CacheDir == nil || *plugin.CacheDir != ".cache/rt" {
		t.Errorf("cacheDir pointer = %v, want .cache/rt", plugin.CacheDir)
	}
	if plugin.RunTypesGenDir == nil || *plugin.RunTypesGenDir != "gen/rt" {
		t.Errorf("runTypesGenDir pointer = %v, want gen/rt", plugin.RunTypesGenDir)
	}

	// No tsconfig in the directory → ok=false, tolerant.
	if _, ok := resolveBuildPlugin(t.TempDir(), ""); ok {
		t.Error("resolveBuildPlugin on an empty dir should return ok=false")
	}
}

// TestUnknownPluginKeys: recognised keys are silent; a typo'd key is reported
// sorted; a project with no plugin entry or no tsconfig never warns.
func TestUnknownPluginKeys(t *testing.T) {
	withConfig := func(t *testing.T, body string) string {
		dir := t.TempDir()
		writeTestFile(t, filepath.Join(dir, "tsconfig.json"), body)
		return dir
	}

	allKnown := withConfig(t, `{ "compilerOptions": { "plugins": [
    { "name": "ts-runtypes", "emitMode": "both", "hashLength": 7, "cacheDir": ".c", "runTypesGenDir": "gen" }
  ] } }`)
	if got := unknownPluginKeys(allKnown, ""); len(got) != 0 {
		t.Errorf("recognised keys should not warn, got %v", got)
	}

	typos := withConfig(t, `{ "compilerOptions": { "plugins": [
    { "name": "ts-runtypes", "emitMdoe": "both", "zzz": 1, "moduleMode": "allSingle" }
  ] } }`)
	got := unknownPluginKeys(typos, "")
	if want := []string{"emitMdoe", "zzz"}; len(got) != 2 || got[0] != want[0] || got[1] != want[1] {
		t.Errorf("unknownPluginKeys = %v, want %v (sorted)", got, want)
	}

	noEntry := withConfig(t, `{ "compilerOptions": { "plugins": [ { "name": "other", "x": 1 } ] } }`)
	if got := unknownPluginKeys(noEntry, ""); len(got) != 0 {
		t.Errorf("no ts-runtypes entry should not warn, got %v", got)
	}

	if got := unknownPluginKeys(t.TempDir(), ""); len(got) != 0 {
		t.Errorf("no tsconfig should not warn, got %v", got)
	}
}

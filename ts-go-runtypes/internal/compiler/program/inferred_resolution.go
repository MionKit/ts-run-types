package program

import (
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/cachedvfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

// InferredResolution is an opaque carrier for the resolution-affecting compiler
// options parsed from a project's tsconfig.json. NewInferred merges them onto
// its hardcoded inferred-project options so the inline-server (lint) path
// resolves modules the same way a build does.
//
// The parsed options are held privately because CompilerOptions.Paths is typed
// *collections.OrderedMap, whose package lives in typescript-go's internal/ tree
// with no shim — it cannot be named from this module. Callers pass the handle
// around; only NewInferred (same package) reads it. A nil handle means "no usable
// tsconfig", so resolution falls back to the inferred defaults.
type InferredResolution struct {
	options *core.CompilerOptions
}

// ParseInferredResolution resolves tsconfigPath relative to cwd and parses it for
// its resolution-affecting options (customConditions / paths / baseUrl). It
// follows `extends`, mirroring program.New's parse, so a customConditions declared
// in a root config is honored by a leaf that extends it.
//
// Best-effort by design: it returns nil — never an error — when tsconfigPath is
// empty, the file is absent, or the config fails to parse. The inline server must
// keep working for consumers who pass no tsconfig or have none on disk (program.New,
// by contrast, hard-errors on a missing tsconfig).
func ParseInferredResolution(cwd, tsconfigPath string) *InferredResolution {
	if cwd == "" || tsconfigPath == "" {
		return nil
	}
	normalizedCwd := tspath.NormalizePath(cwd)
	configPath := tspath.ResolvePath(normalizedCwd, tsconfigPath)

	fileSystem := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	if !fileSystem.FileExists(configPath) {
		return nil
	}

	host := compiler.NewCompilerHost(normalizedCwd, fileSystem, bundled.LibPath(), nil, nil)
	parsed, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(
		configPath, &core.CompilerOptions{}, nil, host, nil,
	)
	// Best-effort: a malformed/partial config falls back to the inferred defaults.
	if len(diagnostics) > 0 || parsed == nil || parsed.ParsedConfig == nil || parsed.ParsedConfig.CompilerOptions == nil {
		return nil
	}
	// Only the resolution-affecting options are read (in NewInferred); the parsed
	// file set and ProjectReferences are discarded, so nothing else needs pruning.
	return &InferredResolution{options: parsed.ParsedConfig.CompilerOptions}
}

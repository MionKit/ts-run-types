package program

import (
	"fmt"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs/cachedvfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

// InferredConfig is an opaque carrier for the FULL parsed CompilerOptions of a
// project tsconfig.json. It is parsed once per process and frozen; NewInferred
// adopts the options wholesale, so every Program built without a config file of
// its own (daemon setSources rebuilds, the inline one-shot, the enrich CLI)
// behaves exactly like the tsgo CLI under the same config — tsgo enforces every
// flag, RunTypes curates nothing.
//
// The parsed options are held privately because CompilerOptions.Paths is typed
// *collections.OrderedMap, whose package lives in typescript-go's internal/ tree
// with no shim — it cannot be named from this module. Callers pass the handle
// around; only NewInferred (same package) reads it. A nil handle means "no
// tsconfig anywhere", so Programs fall back to the fixed inferred defaults.
type InferredConfig struct {
	options *core.CompilerOptions
}

// ParseInferredConfig resolves tsconfigPath relative to cwd and parses it with
// tsgo's own config loader (follows `extends`), freezing the effective
// CompilerOptions for the process lifetime.
//
// Strict like tsc: a NAMED config that is missing or fails to parse returns an
// error carrying the first tsgo diagnostic. (nil, nil) only when tsconfigPath
// is empty — no config was named, and the caller falls back to the fixed
// inferred defaults (tsc's own loose-file posture).
//
// extraConditions (the enrich CLI passes "source") are folded in ONCE here: the
// parsed options are Clone()d and CustomConditions becomes the union. With no
// extras the parsed pointer is used as-is — zero mutation, shared safely across
// every sequential Program (tsgo's own LSP pattern). The options are never
// rebuilt field-by-field: that would drop ConfigFilePath, which roots @types
// discovery.
func ParseInferredConfig(cwd, tsconfigPath string, extraConditions ...string) (*InferredConfig, error) {
	if tsconfigPath == "" {
		return nil, nil
	}
	if cwd == "" {
		return nil, fmt.Errorf("tsconfig %s: no cwd to resolve it against", tsconfigPath)
	}
	normalizedCwd := tspath.NormalizePath(cwd)
	configPath := tspath.ResolvePath(normalizedCwd, tsconfigPath)

	fileSystem := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	if !fileSystem.FileExists(configPath) {
		return nil, fmt.Errorf("tsconfig not found at %s", configPath)
	}

	host := compiler.NewCompilerHost(normalizedCwd, fileSystem, bundled.LibPath(), nil, nil)
	parsed, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(
		configPath, &core.CompilerOptions{}, nil, host, nil,
	)
	if len(diagnostics) > 0 {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(diagnostics[0], ast.DefaultLocale()))
	}
	if parsed == nil || parsed.ParsedConfig == nil || parsed.ParsedConfig.CompilerOptions == nil {
		return nil, fmt.Errorf("tsconfig %s: parse produced no compiler options", configPath)
	}
	// The inferred lanes take their roots from the caller, never from the
	// config's include set, so TS18003 "no inputs" is irrelevant here.
	if contentDiagnostic := firstConfigContentError(parsed, true); contentDiagnostic != nil {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(contentDiagnostic, ast.DefaultLocale()))
	}

	options := parsed.ParsedConfig.CompilerOptions
	if len(extraConditions) > 0 {
		options = options.Clone()
		options.CustomConditions = mergeConditions(extraConditions, parsed.ParsedConfig.CompilerOptions.CustomConditions)
	}
	return &InferredConfig{options: options}, nil
}

// noInputsFoundCode is tsc's TS18003 ("No inputs were found in config file") —
// the one config diagnostic that only concerns the config's OWN include set.
const noInputsFoundCode = 18003

// firstConfigContentError returns the first fatal config-CONTENT diagnostic of
// a parse, or nil. Syntax and option-validation errors ride the
// ParsedCommandLine (GetConfigFileParsingDiagnostics), NOT the second return of
// GetParsedCommandLineOfConfigFile, which only carries file-read failures —
// checking the second return alone silently accepts a malformed config.
// allowNoInputs skips TS18003 for callers that supply their own roots.
func firstConfigContentError(parsed *tsoptions.ParsedCommandLine, allowNoInputs bool) *ast.Diagnostic {
	for _, diagnostic := range parsed.GetConfigFileParsingDiagnostics() {
		if allowNoInputs && diagnostic.Code() == noInputsFoundCode {
			continue
		}
		return diagnostic
	}
	return nil
}

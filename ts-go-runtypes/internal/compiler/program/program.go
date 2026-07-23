// Package program wraps the tsgolint shim-exposed typescript-go compiler in a
// minimal, reusable bootstrap. It creates a Program from a tsconfig.json (or
// from an inferred project for a set of loose files), binds the source files,
// and exposes the Program plus a checker pool for downstream type queries.
package program

import (
	"errors"
	"fmt"
	"slices"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/bundled"
	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs"
	"github.com/microsoft/typescript-go/shim/vfs/cachedvfs"
	"github.com/microsoft/typescript-go/shim/vfs/osvfs"
)

type Options struct {
	Cwd            string
	TsconfigPath   string
	SingleThreaded bool
	// Overlay lets callers inject virtual file contents (absolute path → source)
	// on top of the on-disk VFS. Used by tests and by the in-memory daemon path.
	Overlay map[string]string
	// Conditions are extra package.json export/import resolution conditions
	// (CustomConditions). The enrichment CLI passes ["source"] so `ts-runtypes`
	// resolves to its in-tree `src` — where the TypeFormat brands live — so a
	// `TF.String<{minLength}>` projects with its FormatAnnotation rather than as a
	// bare `string`. Empty (the default) leaves resolution unchanged. NewInferred only.
	Conditions []string
	// ResolutionBase carries a project's tsconfig-derived resolution options
	// (customConditions / paths / baseUrl / pathsBasePath) for NewInferred to MERGE
	// onto its hardcoded inferred-project options, so the inline-server (lint) path
	// resolves modules the same way a build does. Produced by ParseInferredResolution;
	// nil (the default) leaves resolution at the inferred defaults. NewInferred only.
	ResolutionBase *InferredResolution
}

type Program struct {
	TS *compiler.Program
	FS vfs.FS
}

// New builds a ts-go Program using the supplied tsconfig.
func New(opts Options) (*Program, error) {
	if opts.Cwd == "" {
		return nil, errors.New("program.New: Cwd is required")
	}
	cwd := tspath.NormalizePath(opts.Cwd)

	baseFS := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	var fileSystem vfs.FS = baseFS
	if len(opts.Overlay) > 0 {
		fileSystem = newOverlayFS(baseFS, opts.Overlay)
	}

	configPath := opts.TsconfigPath
	if configPath == "" {
		configPath = tspath.ResolvePath(cwd, "tsconfig.json")
	} else {
		configPath = tspath.ResolvePath(cwd, configPath)
	}
	if !fileSystem.FileExists(configPath) {
		return nil, fmt.Errorf("tsconfig not found at %s", configPath)
	}

	host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)

	parsedConfig, diagnostics := tsoptions.GetParsedCommandLineOfConfigFile(
		configPath, &core.CompilerOptions{}, nil, host, nil,
	)
	if len(diagnostics) > 0 {
		return nil, fmt.Errorf("tsconfig parse failed: %s", ast.Diagnostic_Localize(diagnostics[0], ast.DefaultLocale()))
	}

	// Project references are a build-orchestration concept (tsc --build); the
	// resolver's job is scanning the SOURCES the bundler will execute, and
	// bundlers (vite/esbuild/rollup) never honor reference redirects. Honoring
	// them here redirected imports that land in a referenced project to that
	// project's declaration OUTPUTS — which typically don't exist in a dev
	// loop — silently resolving every marker to nothing and yielding a
	// zero-site scan with no diagnostics (docs/done/
	// project-references-unbuilt-outputs-silent-zero-sites.md, found by the
	// mion migration). Dropping them keeps normal module resolution (paths,
	// node_modules, custom conditions) pointed at real sources.
	if parsedConfig.ParsedConfig != nil {
		parsedConfig.ParsedConfig.ProjectReferences = nil
	}

	programOpts := compiler.ProgramOptions{
		Config:         parsedConfig,
		SingleThreaded: core.TSFalse,
		Host:           host,
	}
	if opts.SingleThreaded {
		programOpts.SingleThreaded = core.TSTrue
	}

	tsProgram := compiler.NewProgram(programOpts)
	if tsProgram == nil {
		return nil, errors.New("compiler.NewProgram returned nil")
	}
	tsProgram.BindSourceFiles()
	return &Program{TS: tsProgram, FS: fileSystem}, nil
}

// NewInferred builds a Program without a tsconfig — used when the caller just
// has a set of loose files (e.g. a daemon serving one file at a time).
func NewInferred(opts Options, fileNames []string) (*Program, error) {
	cwd := tspath.NormalizePath(opts.Cwd)

	baseFS := bundled.WrapFS(cachedvfs.From(osvfs.FS()))
	var fileSystem vfs.FS = baseFS
	if len(opts.Overlay) > 0 {
		fileSystem = newOverlayFS(baseFS, opts.Overlay)
	}

	host := compiler.NewCompilerHost(cwd, fileSystem, bundled.LibPath(), nil, nil)

	compilerOptions := &core.CompilerOptions{
		Module:                     core.ModuleKindESNext,
		ModuleResolution:           core.ModuleResolutionKindBundler,
		Target:                     core.ScriptTargetES2022,
		AllowImportingTsExtensions: core.TSTrue,
		StrictNullChecks:           core.TSTrue,
		StrictFunctionTypes:        core.TSTrue,
		ESModuleInterop:            core.TSTrue,
		AllowNonTsExtensions:       core.TSTrue,
		ResolveJsonModule:          core.TSTrue,
		CustomConditions:           opts.Conditions,
	}
	// Cherry-pick ONLY the resolution-affecting options from the project tsconfig;
	// every hardcoded flag above stays load-bearing for scanning .ts source overlays
	// (a bundler-style inferred project), so the tsconfig's Module/Target/Strict*/etc.
	// are deliberately NOT adopted. paths resolve relative to PathsBasePath (the
	// tsconfig's own dir), which can differ from cwd — so it must travel with Paths.
	// Field assignment copies a pointer (Paths), two strings, and a slice — never the
	// noCopy CompilerOptions struct by value.
	if base := opts.ResolutionBase; base != nil && base.options != nil {
		src := base.options
		compilerOptions.Paths = src.Paths
		compilerOptions.BaseUrl = src.BaseUrl
		compilerOptions.PathsBasePath = src.PathsBasePath
		compilerOptions.CustomConditions = mergeConditions(opts.Conditions, src.CustomConditions)
	}

	programOpts := compiler.ProgramOptions{
		Config: &tsoptions.ParsedCommandLine{
			ParsedConfig: &core.ParsedOptions{
				CompilerOptions: compilerOptions,
				FileNames:       fileNames,
			},
		},
		SingleThreaded: core.TSFalse,
		Host:           host,
	}
	if opts.SingleThreaded {
		programOpts.SingleThreaded = core.TSTrue
	}

	tsProgram := compiler.NewProgram(programOpts)
	if tsProgram == nil {
		return nil, errors.New("compiler.NewProgram returned nil")
	}
	tsProgram.BindSourceFiles()
	return &Program{TS: tsProgram, FS: fileSystem}, nil
}

// mergeConditions unions extra onto base, order-preserving and deduped, so an
// explicit program.Options.Conditions and a tsconfig's customConditions coexist.
// On the inline-server path base is nil, so the result is exactly the tsconfig's
// customConditions.
func mergeConditions(base, extra []string) []string {
	out := append([]string(nil), base...)
	for _, condition := range extra {
		if !slices.Contains(out, condition) {
			out = append(out, condition)
		}
	}
	return out
}

// SourceFile returns the parsed source file for the given absolute path, or nil
// if the file is not part of the program.
func (program *Program) SourceFile(absPath string) *ast.SourceFile {
	return program.TS.GetSourceFile(absPath)
}

// IsIncremental reports whether the loaded project enables TypeScript's
// incremental or composite compilation — tsc's own switch for persisting build
// state between runs. The RT disk cache follows it: on when the project is
// incremental/composite, off otherwise. The value comes from the fully parsed
// config, so an `incremental`/`composite` inherited through `extends` counts.
// Nil-safe (returns false when there is no program, e.g. the inline-server
// path before its first setSources).
func (program *Program) IsIncremental() bool {
	if program == nil || program.TS == nil {
		return false
	}
	options := program.TS.Options()
	return options != nil && options.IsIncremental()
}

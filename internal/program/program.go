// Package program wraps the tsgolint shim-exposed typescript-go compiler in a
// minimal, reusable bootstrap. It creates a Program from a tsconfig.json (or
// from an inferred project for a set of loose files), binds the source files,
// and exposes the Program plus a checker pool for downstream type queries.
package program

import (
	"errors"
	"fmt"

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

	programOpts := compiler.ProgramOptions{
		Config: &tsoptions.ParsedCommandLine{
			ParsedConfig: &core.ParsedOptions{
				CompilerOptions: &core.CompilerOptions{
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
				},
				FileNames: fileNames,
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

// SourceFile returns the parsed source file for the given absolute path, or nil
// if the file is not part of the program.
func (program *Program) SourceFile(absPath string) *ast.SourceFile {
	return program.TS.GetSourceFile(absPath)
}

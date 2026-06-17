package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// enrichmentCommands are the out-of-band argv subcommands handled before the
// normal flag parse. They are NOT the vite-build path: the plugin spawns the
// binary with a flag (e.g. --one-shot) as os.Args[1], which never matches one
// of these, so existing behaviour is untouched.
var enrichmentCommands = map[string]func([]string){
	"describe": runDescribe,
	"gen":      runGen,
	"check":    runCheck,
}

// dispatchEnrichmentCommand runs the matching subcommand handler (which exits
// the process) and reports whether os.Args[1] was one. main() calls this at
// the very top, before flag.Parse().
func dispatchEnrichmentCommand() bool {
	if len(os.Args) <= 1 {
		return false
	}
	handler, ok := enrichmentCommands[os.Args[1]]
	if !ok {
		return false
	}
	handler(os.Args[2:])
	return true
}

// buildProgram constructs an inferred Program + resolver over absPath. The
// caller owns the resolver and MUST call res.Close() when done (it keeps the
// checker live for as long as the walk needs it). Shared by resolveOne and the
// check command, which walks the file's AST against the still-open checker.
func buildProgram(absPath string) (*program.Program, *resolver.Resolver, error) {
	cwd := filepath.Dir(absPath)
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Conditions: []string{"source"}}, []string{absPath})
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// buildProgramMulti constructs ONE inferred Program + resolver over several
// files — the batch `gen --files` path. Cwd is the first file's directory.
// Caller owns res and MUST Close() it. One Program means the heavy parse/bind
// is paid once for the whole batch; each file's `Target` resolves against it.
func buildProgramMulti(absPaths []string) (*program.Program, *resolver.Resolver, error) {
	if len(absPaths) == 0 {
		return nil, nil, fmt.Errorf("no files given")
	}
	cwd := filepath.Dir(absPaths[0])
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Conditions: []string{"source"}}, absPaths)
	if err != nil {
		return nil, nil, fmt.Errorf("build program: %w", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		return nil, nil, fmt.Errorf("build resolver: %w", err)
	}
	return prog, res, nil
}

// resolveOne builds a Program over absPath, a resolver, and resolves typeName
// to its canonical RunType. Shared by describe + gen.
func resolveOne(absPath, typeName string) (*enrichment.Resolved, error) {
	prog, res, err := buildProgram(absPath)
	if err != nil {
		return nil, err
	}
	defer res.Close()
	return enrichment.ResolveType(prog, res, absPath, typeName)
}

func runDescribe(args []string) {
	fs := flag.NewFlagSet("describe", flag.ExitOnError)
	format := fs.String("format", "text", "output format: text | json")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes describe <file.ts> <TypeName> [--format text|json]")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("describe: %v", err)
	}
	if len(positional) < 2 {
		fs.Usage()
		os.Exit(2)
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))
	typeName := positional[1]

	resolved, err := resolveOne(absPath, typeName)
	if err != nil {
		fatal("describe: %v", err)
	}

	description := enrichment.Describe(resolved.Node, enrichment.DescribeOptions{
		TypeName: typeName,
		Resolve:  resolved.Resolve,
	})

	switch *format {
	case "json":
		payload := map[string]string{"typeName": typeName, "description": description}
		encoded, err := json.MarshalIndent(payload, "", "  ")
		if err != nil {
			fatal("describe: encode json: %v", err)
		}
		fmt.Println(string(encoded))
	case "text", "":
		fmt.Println(description)
	default:
		fatal("describe: unknown --format %q (want text|json)", *format)
	}
	os.Exit(0)
}

func runGen(args []string) {
	fs := flag.NewFlagSet("gen", flag.ExitOnError)
	mock := fs.Bool("mock", false, "emit a MockData<T> skeleton")
	friendly := fs.Bool("friendly", false, "emit a FriendlyType<T> skeleton")
	out := fs.String("out", "", "target .rt.ts path (default: <dir>/<basename>.rt.ts)")
	files := fs.String("files", "", "batch mode: comma-separated files; resolve --type in each, print JSON skeletons to stdout (no writes)")
	typeFlag := fs.String("type", "", "batch mode: the type name to resolve in every --files entry")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes gen <file.ts> <TypeName> [--mock] [--friendly] [--out <path>]")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --files a.ts,b.ts --type Target   (batch, JSON to stdout)")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("gen: %v", err)
	}
	if *files != "" {
		if *typeFlag == "" {
			fatal("gen --files: --type is required")
		}
		runGenBatch(strings.Split(*files, ","), *typeFlag)
		return
	}
	if len(positional) < 2 {
		fs.Usage()
		os.Exit(2)
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))
	typeName := positional[1]

	// Default (no flag): emit BOTH friendly + mock.
	wantFriendly, wantMock := *friendly, *mock
	if !wantFriendly && !wantMock {
		wantFriendly, wantMock = true, true
	}

	outPath := *out
	if outPath == "" {
		dir := filepath.Dir(absPath)
		base := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
		outPath = filepath.Join(dir, base+".rt.ts")
	}

	// Named-type-driven emission: resolve the RAW (non-inlined) graph so the
	// closure walk can tell a named-type reference from an anonymous inline shape,
	// then emit ONE friendly+mock const per named type in the closure, in
	// dependency (topological) order, with cross-const references between them.
	prog, res, err := buildProgram(absPath)
	if err != nil {
		fatal("gen: %v", err)
	}
	defer res.Close()
	resolved, err := enrichment.ResolveTypeRaw(prog, res, absPath, typeName)
	if err != nil {
		fatal("gen: %v", err)
	}

	closure := enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
		TypeName: typeName,
		Resolve:  resolved.Resolve,
	})

	existing := ""
	if bytes, err := os.ReadFile(outPath); err == nil {
		existing = string(bytes)
	} else if !os.IsNotExist(err) {
		fatal("gen: read %s: %v", outPath, err)
	}

	// One block per (named type × wanted artifact), create-only: skip an export the
	// file already declares. `closure` is already topologically ordered, so a
	// referenced const is declared before its referrer.
	var added []string
	var blocks []string
	for _, named := range closure {
		if wantFriendly && !hasExport(existing, named.FriendlyVar) {
			blocks = append(blocks, constBlock(named.FriendlyVar, "FriendlyType", named.TypeName, named.Friendly))
			added = append(added, named.FriendlyVar)
		}
		if wantMock && !hasExport(existing, named.MockVar) {
			blocks = append(blocks, constBlock(named.MockVar, "MockData", named.TypeName, named.Mock))
			added = append(added, named.MockVar)
		}
	}

	if len(blocks) == 0 {
		fmt.Printf("gen: nothing to write — %s already has the requested export(s)\n", outPath)
		os.Exit(0)
	}

	var builder strings.Builder
	if existing == "" {
		// New file: lead with the import type lines — every named type in the
		// closure (the root + all referenced types defined in this file).
		importSpec := filepath.Base(absPath)
		builder.WriteString("import type { ")
		builder.WriteString(strings.Join(closureTypeNames(closure), ", "))
		builder.WriteString(" } from './")
		builder.WriteString(strings.TrimSuffix(importSpec, filepath.Ext(importSpec)))
		builder.WriteString("';\n")
		builder.WriteString("import type { FriendlyType, MockData } from 'ts-runtypes';\n\n")
	} else {
		builder.WriteString(existing)
		if !strings.HasSuffix(existing, "\n") {
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}
	builder.WriteString(strings.Join(blocks, "\n"))

	if err := os.WriteFile(outPath, []byte(builder.String()), 0o644); err != nil {
		fatal("gen: write %s: %v", outPath, err)
	}
	verb := "wrote"
	if existing != "" {
		verb = "appended to"
	}
	fmt.Printf("gen: %s %s (%s)\n", verb, outPath, strings.Join(added, ", "))
	os.Exit(0)
}

// constBlock wraps a rendered object-literal body in the
// `export const <var>: <Wrapper><<TypeName>> = <body>;` declaration.
func constBlock(varName, wrapper, typeName, body string) string {
	return "export const " + varName + ": " + wrapper + "<" + typeName + "> = " + body + ";\n"
}

// closureTypeNames returns the distinct source type names in a closure, in
// emission order, for the generated `import type { … }` line.
func closureTypeNames(closure []enrichment.NamedConst) []string {
	seen := make(map[string]bool, len(closure))
	names := make([]string, 0, len(closure))
	for _, named := range closure {
		if named.TypeName == "" || seen[named.TypeName] {
			continue
		}
		seen[named.TypeName] = true
		names = append(names, named.TypeName)
	}
	return names
}

// runGenBatch is the `gen --files a.ts,b.ts --type Target` path: ONE Program over
// all files, resolve typeName per file, and print a JSON map
// { <basename-without-ext> → {friendly, mock} } of object-literal skeletons. No
// files are written. Used by the enrichment generation test harness.
func runGenBatch(files []string, typeName string) {
	absPaths := make([]string, 0, len(files))
	for _, file := range files {
		trimmed := strings.TrimSpace(file)
		if trimmed == "" {
			continue
		}
		absPaths = append(absPaths, tspath.NormalizePath(mustAbs(trimmed)))
	}
	prog, res, err := buildProgramMulti(absPaths)
	if err != nil {
		fatal("gen --files: %v", err)
	}
	defer res.Close()

	type skeletons struct {
		Friendly string `json:"friendly"`
		Mock     string `json:"mock"`
	}
	out := make(map[string]skeletons, len(absPaths))
	for _, absPath := range absPaths {
		resolved, err := enrichment.ResolveType(prog, res, absPath, typeName)
		if err != nil {
			fatal("gen --files: %s: %v", absPath, err)
		}
		key := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
		out[key] = skeletons{
			Friendly: enrichment.FriendlySkeleton(resolved.Node, resolved.Resolve),
			Mock:     enrichment.MockSkeleton(resolved.Node, resolved.Resolve),
		}
	}
	encoded, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		fatal("gen --files: encode json: %v", err)
	}
	fmt.Println(string(encoded))
	os.Exit(0)
}

// valueFlags are the enrichment flags that consume the following token as
// their value when written space-separated (e.g. `--format json`). Boolean
// flags (--mock, --friendly) are absent here.
var valueFlags = map[string]bool{
	"--format": true, "-format": true,
	"--out": true, "-out": true,
	"--files": true, "-files": true,
	"--type": true, "-type": true,
}

// splitArgs separates positional arguments from flag tokens so flags may appear
// before, after, or interspersed with the positional <file> <TypeName> pair —
// Go's flag package otherwise stops at the first positional. A `-`-prefixed
// token is a flag; if it's a known value-flag without an inline `=value`, the
// next token is pulled along as its value.
func splitArgs(args []string) (positional, flags []string) {
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "-") && arg != "-" {
			flags = append(flags, arg)
			if !strings.Contains(arg, "=") && valueFlags[arg] && i+1 < len(args) {
				i++
				flags = append(flags, args[i])
			}
			continue
		}
		positional = append(positional, arg)
	}
	return positional, flags
}

// hasExport reports whether source already declares `export const <varName>`.
func hasExport(source, varName string) bool {
	if source == "" {
		return false
	}
	pattern := regexp.MustCompile(`export\s+const\s+` + regexp.QuoteMeta(varName) + `\b`)
	return pattern.MatchString(source)
}

// mustAbs resolves path to an absolute path, exiting on failure.
func mustAbs(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		fatal("resolve path %q: %v", path, err)
	}
	return abs
}

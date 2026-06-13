package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	out := fs.String("out", "", "explicit single mirror file path (overrides the computed mirror path; forces a single file)")
	enrichDirFlag := fs.String("enrich-dir", "", "mirror root override (precedence: this flag > tsconfig plugins entry > default runtypes/generated)")
	check := fs.Bool("check", false, "drift check: validate mirror-file breadcrumbs instead of generating")
	files := fs.String("files", "", "batch mode: comma-separated files; resolve --type in each, print JSON skeletons to stdout (no writes)")
	typeFlag := fs.String("type", "", "batch mode: the type name to resolve in every --files entry")
	update := fs.Bool("update", false, "reconcile an existing committed mirror file against the freshly regenerated desired set (property merge, never clobbers values)")
	prune := fs.Bool("prune", false, "destructive: remove every comment block/line tagged @rtOrphan / @rtOrphanChild")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes gen <file.ts> <TypeName> [--mock] [--friendly] [--enrich-dir <dir>] [--out <path>]")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen <file.ts> <TypeName> --update   (reconcile an existing mirror)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --prune [<mirror-file-or-dir>]   (strip @rtOrphan carcasses)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --check [<mirror-file-or-dir>]   (breadcrumb drift)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --files a.ts,b.ts --type Target   (batch, JSON to stdout)")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("gen: %v", err)
	}

	// Mutual-exclusion guards. --update is the reconcile op; it cannot combine
	// with --check (drift report) or --files (batch stdout, no writes). --prune
	// is the standalone destructive sweep and likewise excludes the others.
	if *update {
		if *check {
			fatal("gen: --update cannot be combined with --check")
		}
		if *files != "" {
			fatal("gen: --update cannot be combined with --files")
		}
		if *prune {
			fatal("gen: --update cannot be combined with --prune")
		}
	}
	if *prune {
		if *check {
			fatal("gen: --prune cannot be combined with --check")
		}
		if *files != "" {
			fatal("gen: --prune cannot be combined with --files")
		}
		runGenPrune(positional, *enrichDirFlag)
		return
	}

	if *files != "" {
		if *typeFlag == "" {
			fatal("gen --files: --type is required")
		}
		runGenBatch(strings.Split(*files, ","), *typeFlag)
		return
	}
	if *check {
		runGenCheck(positional, *enrichDirFlag)
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

	config := resolveEnrichConfig(absPath, *enrichDirFlag)

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
		TypeName:  typeName,
		Resolve:   resolved.Resolve,
		DeclFiles: resolved.DeclFiles,
	})

	// Group the closure by declaration source file → one mirror file per group.
	// A const with no resolved DeclFile falls back to the gen target (absPath).
	// When --out is given, force every const into that one file (legacy single-file
	// override): all consts share one synthetic group keyed by absPath.
	groups := groupByDeclFile(closure, absPath, *out != "")

	// varDeclFile maps each emitted const var → the source file its type is
	// declared in, so a referrer in mirror file A can emit a cross-file value
	// import for a var whose home is mirror file B.
	varDeclFile := map[string]string{}
	for _, named := range closure {
		declFile := named.DeclFile
		if declFile == "" {
			declFile = absPath
		}
		varDeclFile[named.FriendlyVar] = declFile
		varDeclFile[named.MockVar] = declFile
	}

	var written, skipped int
	for _, group := range groups {
		mirror := config.mirrorPath(group.declFile)
		if *out != "" {
			mirror = tspath.NormalizePath(mustAbs(*out))
		}
		spec := mirrorWrite{
			mirrorPath:   mirror,
			sourceFile:   group.declFile,
			consts:       group.consts,
			varDeclFile:  varDeclFile,
			config:       config,
			out:          *out,
			wantFriendly: wantFriendly,
			wantMock:     wantMock,
		}
		var wrote bool
		if *update {
			wrote = updateMirrorFile(spec)
		} else {
			wrote = writeMirrorFile(spec)
		}
		if wrote {
			written++
		} else {
			skipped++
		}
	}
	if written == 0 {
		fmt.Printf("gen: nothing to write — mirror file(s) already have the requested export(s)\n")
	}
	os.Exit(0)
}

// declFileGroup is one mirror file's worth of consts: every NamedConst whose
// type is declared in declFile, in topological (declared-before-use) order.
type declFileGroup struct {
	declFile string
	consts   []enrichment.NamedConst
}

// groupByDeclFile buckets a topologically-ordered closure by each const's
// declaration file (falling back to fallbackFile when DeclFile is empty),
// preserving the closure's order within each bucket. forceSingle collapses every
// const into one group keyed by fallbackFile (the --out single-file override).
// Group order follows first appearance, so dependency order is preserved when a
// referenced type's file is emitted before its referrer's.
func groupByDeclFile(closure []enrichment.NamedConst, fallbackFile string, forceSingle bool) []declFileGroup {
	indexByFile := map[string]int{}
	var groups []declFileGroup
	for _, named := range closure {
		declFile := fallbackFile
		if !forceSingle && named.DeclFile != "" {
			declFile = named.DeclFile
		}
		index, ok := indexByFile[declFile]
		if !ok {
			index = len(groups)
			indexByFile[declFile] = index
			groups = append(groups, declFileGroup{declFile: declFile})
		}
		groups[index].consts = append(groups[index].consts, named)
	}
	return groups
}

// mirrorWrite is the arg bundle for writeMirrorFile.
type mirrorWrite struct {
	mirrorPath   string
	sourceFile   string
	consts       []enrichment.NamedConst
	varDeclFile  map[string]string
	config       enrichConfig
	out          string
	wantFriendly bool
	wantMock     bool
}

// writeMirrorFile emits (or appends to) one mirror file for a single source
// file's consts. It returns true when it wrote anything, false when every
// requested export was already present (create-only skip). Parent dirs are
// created as needed.
func writeMirrorFile(spec mirrorWrite) bool {
	existing := ""
	if bytes, err := os.ReadFile(spec.mirrorPath); err == nil {
		existing = string(bytes)
	} else if !os.IsNotExist(err) {
		fatal("gen: read %s: %v", spec.mirrorPath, err)
	}

	// Create-only: skip an export the file already declares. The closure is
	// topologically ordered so a referenced const precedes its referrer.
	var added []string
	var blocks []string
	for _, named := range spec.consts {
		if spec.wantFriendly && !hasExport(existing, named.FriendlyVar) {
			blocks = append(blocks, constBlock(named.FriendlyVar, "FriendlyType", named, named.Friendly))
			added = append(added, named.FriendlyVar)
		}
		if spec.wantMock && !hasExport(existing, named.MockVar) {
			blocks = append(blocks, constBlock(named.MockVar, "MockData", named, named.Mock))
			added = append(added, named.MockVar)
		}
	}
	if len(blocks) == 0 {
		return false
	}

	var builder strings.Builder
	if existing == "" {
		writeMirrorHeader(&builder, spec, blocks)
	} else {
		builder.WriteString(existing)
		if !strings.HasSuffix(existing, "\n") {
			builder.WriteString("\n")
		}
		builder.WriteString("\n")
	}
	builder.WriteString(strings.Join(blocks, "\n"))

	if err := os.MkdirAll(filepath.Dir(spec.mirrorPath), 0o755); err != nil {
		fatal("gen: mkdir %s: %v", filepath.Dir(spec.mirrorPath), err)
	}
	if err := os.WriteFile(spec.mirrorPath, []byte(builder.String()), 0o644); err != nil {
		fatal("gen: write %s: %v", spec.mirrorPath, err)
	}
	verb := "wrote"
	if existing != "" {
		verb = "appended to"
	}
	fmt.Printf("gen: %s %s (%s)\n", verb, spec.mirrorPath, strings.Join(added, ", "))
	return true
}

// writeMirrorHeader emits the import block for a fresh mirror file: the
// `import type { … } from '<rel to source>'` breadcrumb (only the types declared
// in THIS source file), the `ts-runtypes` DSL types, and one deduped cross-file
// value-import line per other mirror file whose consts this file references.
func writeMirrorHeader(builder *strings.Builder, spec mirrorWrite, blocks []string) {
	// The source breadcrumb: relative path from the mirror file back to the source
	// file, strictly `import type` (no value-level source→mirror cycle).
	sourceSpec := importSpecifier(spec.mirrorPath, spec.sourceFile)
	builder.WriteString("import type { ")
	builder.WriteString(strings.Join(constTypeNames(spec.consts), ", "))
	builder.WriteString(" } from '")
	builder.WriteString(sourceSpec)
	builder.WriteString("';\n")
	builder.WriteString("import type { FriendlyType, MockData } from 'ts-runtypes';\n")

	// Cross-file value imports: collect the friendly*/mock* vars referenced in the
	// rendered blocks whose declaration file differs from this group's source file,
	// grouped by their home mirror file.
	thisFile := tspath.NormalizePath(spec.sourceFile)
	importsByMirror := map[string]map[string]bool{}
	body := strings.Join(blocks, "\n")
	for _, varName := range referencedVars(body) {
		declFile, ok := spec.varDeclFile[varName]
		if !ok {
			continue
		}
		if tspath.NormalizePath(declFile) == thisFile {
			continue // intra-file reference — no import
		}
		if spec.out != "" {
			continue // single-file --out: every const lives in one file, no imports
		}
		targetMirror := spec.config.mirrorPath(declFile)
		if importsByMirror[targetMirror] == nil {
			importsByMirror[targetMirror] = map[string]bool{}
		}
		importsByMirror[targetMirror][varName] = true
	}
	for _, line := range crossFileImportLines(spec.mirrorPath, importsByMirror) {
		builder.WriteString(line)
	}
	builder.WriteString("\n")
}

// crossFileImportLines renders deterministic `import { … } from '<rel>'` lines —
// one per target mirror file, vars sorted — for the cross-file references found
// in a mirror file. Mirror targets are sorted by their import specifier so output
// is stable.
func crossFileImportLines(fromMirror string, importsByMirror map[string]map[string]bool) []string {
	type entry struct {
		spec string
		vars []string
	}
	entries := make([]entry, 0, len(importsByMirror))
	for targetMirror, varSet := range importsByMirror {
		vars := make([]string, 0, len(varSet))
		for varName := range varSet {
			vars = append(vars, varName)
		}
		sort.Strings(vars)
		entries = append(entries, entry{spec: importSpecifier(fromMirror, targetMirror), vars: vars})
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].spec < entries[right].spec })

	lines := make([]string, 0, len(entries))
	for _, item := range entries {
		lines = append(lines, "import { "+strings.Join(item.vars, ", ")+" } from '"+item.spec+"';\n")
	}
	return lines
}

// referencedVars returns the distinct friendly*/mock* identifiers appearing in a
// rendered body — the const-var references the closure emitter inlined. It is a
// token scan (the bodies are object literals with bare identifier values), the
// same convention the closure test's TDZ check uses.
func referencedVars(body string) []string {
	seen := map[string]bool{}
	var out []string
	for _, token := range strings.FieldsFunc(body, func(r rune) bool {
		return !(r == '$' || r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'))
	}) {
		if token == "friendly" || token == "mock" {
			continue
		}
		if !strings.HasPrefix(token, "friendly") && !strings.HasPrefix(token, "mock") {
			continue
		}
		suffix := strings.TrimPrefix(strings.TrimPrefix(token, "friendly"), "mock")
		if suffix == "" || suffix[0] < 'A' || suffix[0] > 'Z' {
			continue // not a const-var (e.g. a field literally named "mockX" in lowercase)
		}
		if !seen[token] {
			seen[token] = true
			out = append(out, token)
		}
	}
	return out
}

// constBlock wraps a rendered object-literal body in the
// `export const <var>: <Wrapper><<TypeName>> = <body>;` declaration, prefixed
// with the reconcile marker JSDoc (`@rtType` + `@rtIds`) when the const carries
// a structural id. The marker lives on the const WRAPPER, never inside the
// skeleton body — the batch stdout path (runGenBatch) compares the body alone,
// so it stays byte-identical.
func constBlock(varName, wrapper string, named enrichment.NamedConst, body string) string {
	marker := markerComment(named.TypeName, named.TypeID, named.ChildIDs)
	return marker + "export const " + varName + ": " + wrapper + "<" + named.TypeName + "> = " + body + ";\n"
}

// markerComment renders the reconcile JSDoc for a const: a single leading line
// `/** @rtType <Name>#<id> @rtIds {field: <ref>#<id>, …} */\n`. It is omitted
// (empty string) when there is no structural id (an unresolved/anonymous root),
// so a degenerate const stays marker-free. The encoding survives Prettier
// (leading JSDoc on a declaration is preserved) and round-trips through
// parseConstMarkers on reconcile.
func markerComment(typeName, typeID string, childIDs map[string]string) string {
	if typeID == "" {
		return ""
	}
	var b strings.Builder
	b.WriteString("/** @rtType ")
	if typeName != "" {
		b.WriteString(typeName)
		b.WriteString("#")
	}
	b.WriteString(typeID)
	if len(childIDs) > 0 {
		b.WriteString(" @rtIds {")
		b.WriteString(formatChildIDs(childIDs))
		b.WriteString("}")
	}
	b.WriteString(" */\n")
	return b.String()
}

// formatChildIDs renders an @rtIds map as `field: id, field2: id2` with keys
// sorted for deterministic, idempotent output.
func formatChildIDs(childIDs map[string]string) string {
	paths := make([]string, 0, len(childIDs))
	for path := range childIDs {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	parts := make([]string, 0, len(paths))
	for _, path := range paths {
		parts = append(parts, path+": "+childIDs[path])
	}
	return strings.Join(parts, ", ")
}

// constTypeNames returns the distinct source type names in a slice of
// NamedConsts, in emission order, for a mirror file's `import type { … }` line.
func constTypeNames(consts []enrichment.NamedConst) []string {
	seen := make(map[string]bool, len(consts))
	names := make([]string, 0, len(consts))
	for _, named := range consts {
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

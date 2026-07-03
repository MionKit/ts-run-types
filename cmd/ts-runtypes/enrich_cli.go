package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrich"
	"github.com/mionkit/ts-runtypes/internal/enrich/mirror"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// enrichCommands are the out-of-band argv subcommands handled before the
// normal flag parse. They are NOT the vite-build path: the plugin spawns the
// binary with a flag (e.g. --one-shot) as os.Args[1], which never matches one
// of these, so existing behaviour is untouched.
var enrichCommands = map[string]func([]string){
	"describe": runDescribe,
	"gen":      runGen,
	"check":    runCheck,
}

// dispatchEnrichCommand runs the matching subcommand handler (which exits
// the process) and reports whether os.Args[1] was one. main() calls this at
// the very top, before flag.Parse().
func dispatchEnrichCommand() bool {
	if len(os.Args) <= 1 {
		return false
	}
	handler, ok := enrichCommands[os.Args[1]]
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
func resolveOne(absPath, typeName string) (*enrich.Resolved, error) {
	prog, res, err := buildProgram(absPath)
	if err != nil {
		return nil, err
	}
	defer res.Close()
	return enrich.ResolveType(prog, res.Checker(), res.Cache(), absPath, typeName)
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

	description := enrich.Describe(resolved.Node, enrich.DescribeOptions{
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
	jsonFlag := fs.Bool("json", false, "with --check: emit findings as a JSON array")
	files := fs.String("files", "", "batch mode: comma-separated files; resolve --type in each, print JSON skeletons to stdout (no writes)")
	typeFlag := fs.String("type", "", "batch mode: the type name to resolve in every --files entry")
	update := fs.Bool("update", false, "reconcile an existing committed mirror file against the freshly regenerated desired set (property merge, never clobbers values)")
	prune := fs.Bool("prune", false, "destructive: remove every comment block/line tagged @rtOrphan / @rtOrphanChild")
	translate := fs.String("translate", "", "i18n: scaffold/reconcile per-locale FriendlyType translation files (a locale tag, or 'all' for every tsconfig i18n.locales entry)")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes gen <file.ts> <TypeName> [--mock] [--friendly] [--enrich-dir <dir>] [--out <path>]")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen <file.ts> <TypeName> --update   (reconcile an existing mirror)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --prune [<mirror-file-or-dir>]   (strip @rtOrphan carcasses)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --check [<mirror-file-or-dir>]   (breadcrumb drift)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --files a.ts,b.ts --type Target   (batch, JSON to stdout)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --translate <locale> [<src.ts>]           (scaffold a locale's translation files)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --translate <locale> --update [<src.ts>]  (reconcile translations against the friendly source mirror)")
		fmt.Fprintln(os.Stderr, "   or: ts-runtypes gen --translate <locale> --prune  [<src.ts>]  (strip translation orphan carcasses)")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("gen: %v", err)
	}

	// --translate is its own lane: the desired side is the friendly source
	// mirror, never the type graph — so it excludes the type-driven modes.
	if *translate != "" {
		if *check || *files != "" || *mock || *friendly || *out != "" {
			fatal("gen: --translate can only combine with --update / --prune / --enrich-dir")
		}
		runGenTranslate(*translate, positional, *update, *prune, *enrichDirFlag)
		return
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
		runGenCheck(positional, *enrichDirFlag, *jsonFlag)
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
	resolved, err := enrich.ResolveTypeRaw(prog, res.Checker(), res.Cache(), absPath, typeName)
	if err != nil {
		fatal("gen: %v", err)
	}
	// The rt$ prefix is RESERVED for enrichment meta keys — a colliding
	// property makes the scaffold unrepresentable, so refuse up front.
	if collisions := enrich.ReservedPropertyCollisions(resolved.Node, resolved.Resolve); len(collisions) > 0 {
		fatal("gen: %s: property %s collides with the reserved enrichment meta prefix 'rt$' — rename the property or exclude the type from enrichment", typeName, strings.Join(collisions, ", "))
	}

	closure := enrich.EmitClosure(resolved.Node, enrich.ClosureOptions{
		TypeName:       typeName,
		Resolve:        resolved.Resolve,
		DeclFiles:      resolved.DeclFiles,
		SourceLocale:   config.SourceLocale,
		FriendlyErrors: config.FriendlyErrors,
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
		for _, spec := range groupSpecs(config, group, varDeclFile, *out, wantFriendly, wantMock) {
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
	}
	if written == 0 {
		fmt.Printf("gen: nothing to write — mirror file(s) already have the requested export(s)\n")
	}
	os.Exit(0)
}

// groupSpecs builds the mirror.Spec set for one source-file group: one spec PER
// WANTED FAMILY (friendly / mock), each targeting its own family-segment mirror
// file with a family-matched MirrorPathFor (so cross-file value imports resolve
// to sibling files of the SAME family). The --out override collapses everything
// into one combined single-file spec (the legacy shape, kept for the explicit
// escape hatch). Before the per-family specs are built, a pre-split combined
// mirror at the legacy (no-family) path is migrated in place.
func groupSpecs(config enrichConfig, group declFileGroup, varDeclFile map[string]string, out string, wantFriendly, wantMock bool) []mirror.Spec {
	if out != "" {
		return []mirror.Spec{{
			MirrorPath:    tspath.NormalizePath(mustAbs(out)),
			SourceFile:    group.declFile,
			Consts:        group.consts,
			VarDeclFile:   varDeclFile,
			Out:           out,
			WantFriendly:  wantFriendly,
			WantMock:      wantMock,
			MirrorPathFor: config.legacyMirrorPath,
		}}
	}

	migrateLegacyMirror(config, group.declFile)

	var specs []mirror.Spec
	for _, family := range wantedFamilies(wantFriendly, wantMock) {
		family := family
		specs = append(specs, mirror.Spec{
			MirrorPath:    config.mirrorPath(family, group.declFile),
			SourceFile:    group.declFile,
			Consts:        group.consts,
			VarDeclFile:   varDeclFile,
			WantFriendly:  family == familyFriendly,
			WantMock:      family == familyMock,
			MirrorPathFor: func(declFile string) string { return config.mirrorPath(family, declFile) },
		})
	}
	return specs
}

// wantedFamilies lists the family segments a gen invocation targets, friendly
// first (matching the historical const order in the combined file).
func wantedFamilies(wantFriendly, wantMock bool) []string {
	var families []string
	if wantFriendly {
		families = append(families, familyFriendly)
	}
	if wantMock {
		families = append(families, familyMock)
	}
	return families
}

// declFileGroup is one mirror file's worth of consts: every NamedConst whose
// type is declared in declFile, in topological (declared-before-use) order.
type declFileGroup struct {
	declFile string
	consts   []enrich.NamedConst
}

// groupByDeclFile buckets a topologically-ordered closure by each const's
// declaration file (falling back to fallbackFile when DeclFile is empty),
// preserving the closure's order within each bucket. forceSingle collapses every
// const into one group keyed by fallbackFile (the --out single-file override).
// Group order follows first appearance, so dependency order is preserved when a
// referenced type's file is emitted before its referrer's.
func groupByDeclFile(closure []enrich.NamedConst, fallbackFile string, forceSingle bool) []declFileGroup {
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

// writeMirrorFile emits (or appends to) one mirror file for a single source
// file's consts. It returns true when it wrote anything, false when every
// requested export was already present (create-only skip). It is the thin CLI
// shim around mirror.Scaffold: it reads the existing file, delegates the pure
// content build, then creates parent dirs + writes. Parent dirs are created as
// needed.
func writeMirrorFile(spec mirror.Spec) bool {
	existing := ""
	if bytes, err := os.ReadFile(spec.MirrorPath); err == nil {
		existing = string(bytes)
	} else if !os.IsNotExist(err) {
		fatal("gen: read %s: %v", spec.MirrorPath, err)
	}

	content, added, err := mirror.Scaffold(spec, existing)
	if err != nil {
		fatal("gen: %v", err)
	}
	if content == "" {
		return false // create-only no-op: every requested export already present
	}

	if err := os.MkdirAll(filepath.Dir(spec.MirrorPath), 0o755); err != nil {
		fatal("gen: mkdir %s: %v", filepath.Dir(spec.MirrorPath), err)
	}
	if err := os.WriteFile(spec.MirrorPath, []byte(content), 0o644); err != nil {
		fatal("gen: write %s: %v", spec.MirrorPath, err)
	}
	verb := "wrote"
	if existing != "" {
		verb = "appended to"
	}
	fmt.Printf("gen: %s %s (%s)\n", verb, spec.MirrorPath, strings.Join(added, ", "))
	return true
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
		resolved, err := enrich.ResolveType(prog, res.Checker(), res.Cache(), absPath, typeName)
		if err != nil {
			fatal("gen --files: %s: %v", absPath, err)
		}
		key := strings.TrimSuffix(filepath.Base(absPath), filepath.Ext(absPath))
		out[key] = skeletons{
			Friendly: enrich.FriendlySkeleton(resolved.Node, resolved.Resolve),
			Mock:     enrich.MockSkeleton(resolved.Node, resolved.Resolve),
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
	"--enrich-dir": true, "-enrich-dir": true,
	"--translate": true, "-translate": true,
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

// mustAbs resolves path to an absolute path, exiting on failure.
func mustAbs(path string) string {
	abs, err := filepath.Abs(path)
	if err != nil {
		fatal("resolve path %q: %v", path, err)
	}
	return abs
}

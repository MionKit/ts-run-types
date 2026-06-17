package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/marker"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// enrichmentMapKind identifies which enrichment-map alias a `const … : X<T>`
// declaration is annotated with.
type enrichmentMapKind int

const (
	mapKindNone enrichmentMapKind = iota
	mapKindFriendly
	mapKindMock
)

// fileFinding pairs a Finding with its source file for the report.
type fileFinding struct {
	File string `json:"file"`
	enrichment.Finding
}

// runCheck implements `ts-runtypes check <file.ts> [--json]`: it finds every
// `const <name>: FriendlyType<T> = {…}` / `const <name>: MockData<T> = {…}`
// declaration in the file, resolves T to a RunType, runs the paired
// FriendlyType / MockData checks, and reports the Findings. Exits 1 when any
// Finding is Error severity.
func runCheck(args []string) {
	fs := flag.NewFlagSet("check", flag.ExitOnError)
	asJSON := fs.Bool("json", false, "emit findings as a JSON array")
	fs.Usage = func() {
		fmt.Fprintln(os.Stderr, "Usage: ts-runtypes check <file.ts> [--json]")
	}
	positional, flags := splitArgs(args)
	if err := fs.Parse(flags); err != nil {
		fatal("check: %v", err)
	}
	if len(positional) < 1 {
		fs.Usage()
		os.Exit(2)
	}
	absPath := tspath.NormalizePath(mustAbs(positional[0]))

	prog, res, err := buildProgram(absPath)
	if err != nil {
		fatal("check: %v", err)
	}
	defer res.Close()

	sourceFile := prog.SourceFile(absPath)
	if sourceFile == nil {
		fatal("check: source file not in program: %s", absPath)
	}
	typeChecker := res.Checker()
	if typeChecker == nil {
		fatal("check: resolver has no checker")
	}

	findings := checkFile(sourceFile, typeChecker, res, absPath)
	sortFileFindings(findings)

	exitCode := reportFindings(findings, *asJSON)
	os.Exit(exitCode)
}

// checkFile walks the file's variable statements, runs the paired checks on
// every FriendlyType / MockData declaration with an object-literal initializer,
// and returns the findings tagged with the file.
func checkFile(sourceFile *ast.SourceFile, typeChecker *checker.Checker, res *resolver.Resolver, absPath string) []fileFinding {
	var out []fileFinding
	root := sourceFile.AsNode()
	if root == nil {
		return out
	}
	for _, statement := range root.Statements() {
		if statement == nil || !ast.IsVariableStatement(statement) {
			continue
		}
		for _, declaration := range variableDeclarations(statement) {
			kind, typeArg := enrichmentAnnotation(typeChecker, declaration)
			if kind == mapKindNone || typeArg == nil {
				continue
			}
			literal := objectLiteralInitializer(declaration)
			if literal == nil {
				continue
			}
			resolved := enrichment.ProjectType(res.Cache(), typeArg)
			if resolved == nil {
				continue
			}
			view := newASTLiteralView(literal)
			var findings []enrichment.Finding
			switch kind {
			case mapKindFriendly:
				findings = enrichment.CheckFriendly(resolved.Node, view, resolved.Resolve)
			case mapKindMock:
				findings = enrichment.CheckMock(resolved.Node, view, resolved.Resolve)
			}
			for _, finding := range findings {
				out = append(out, fileFinding{File: absPath, Finding: finding})
			}
		}
	}
	return out
}

// variableDeclarations returns the VariableDeclaration nodes of a
// VariableStatement.
func variableDeclarations(statement *ast.Node) []*ast.Node {
	declaration := statement.AsVariableStatement().DeclarationList
	if declaration == nil {
		return nil
	}
	list := declaration.AsVariableDeclarationList()
	if list == nil || list.Declarations == nil {
		return nil
	}
	return list.Declarations.Nodes
}

// enrichmentAnnotation reports whether declaration's type annotation is a
// reference to FriendlyType / MockData declared in the ts-runtypes package, and
// returns the reference's first type argument (T) projected to a checker type.
//
// The alias name is read off the type-reference SYNTAX (TypeName symbol),
// resolving the local import alias to its target via SkipAlias, then confirming
// the module the same way marker.go does. We can't read it off the resolved
// `*checker.Type` (marker.go's aliasForSpec path) because FriendlyType<T>'s body
// reduces immediately, so getTypeFromTypeNode drops the alias info.
func enrichmentAnnotation(typeChecker *checker.Checker, declaration *ast.Node) (enrichmentMapKind, *checker.Type) {
	if !ast.IsVariableDeclaration(declaration) {
		return mapKindNone, nil
	}
	typeNode := declaration.AsVariableDeclaration().Type
	if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
		return mapKindNone, nil
	}
	typeName := typeNode.AsTypeReferenceNode().TypeName
	if typeName == nil {
		return mapKindNone, nil
	}
	symbol := typeChecker.GetSymbolAtLocation(typeName)
	if symbol == nil {
		return mapKindNone, nil
	}
	// A `import {FriendlyType} from 'ts-runtypes'` reference resolves to a local
	// import-alias symbol whose declaration is the import specifier; SkipAlias
	// follows it to the original type-alias declaration in the package.
	if symbol.Flags&ast.SymbolFlagsAlias != 0 {
		symbol = checker.SkipAlias(symbol, typeChecker)
	}
	if symbol == nil {
		return mapKindNone, nil
	}
	var kind enrichmentMapKind
	switch symbol.Name {
	case "FriendlyType":
		kind = mapKindFriendly
	case "MockData":
		kind = mapKindMock
	default:
		return mapKindNone, nil
	}
	if !marker.DeclaredInModule(symbol, marker.DefaultModule) {
		return mapKindNone, nil
	}
	typeArgumentNodes := typeNode.TypeArguments()
	if len(typeArgumentNodes) == 0 {
		return mapKindNone, nil
	}
	typeArg := checker.Checker_getTypeFromTypeNode(typeChecker, typeArgumentNodes[0])
	if typeArg == nil {
		return mapKindNone, nil
	}
	return kind, typeArg
}

// objectLiteralInitializer returns declaration's initializer when it is an
// object literal, else nil.
func objectLiteralInitializer(declaration *ast.Node) *ast.Node {
	initializer := declaration.AsVariableDeclaration().Initializer
	if initializer == nil || !ast.IsObjectLiteralExpression(initializer) {
		return nil
	}
	return initializer
}

// sortFileFindings orders findings by (File, Path, Code) for deterministic
// reporting.
func sortFileFindings(findings []fileFinding) {
	sort.SliceStable(findings, func(left, right int) bool {
		if findings[left].File != findings[right].File {
			return findings[left].File < findings[right].File
		}
		if findings[left].Path != findings[right].Path {
			return findings[left].Path < findings[right].Path
		}
		return findings[left].Code < findings[right].Code
	})
}

// reportFindings prints findings (text or JSON) and the stderr summary, and
// returns the process exit code (1 when any Error finding is present).
func reportFindings(findings []fileFinding, asJSON bool) int {
	hasError := false
	for _, finding := range findings {
		if finding.Severity == enrichment.Error {
			hasError = true
		}
	}

	if asJSON {
		encoded, err := json.MarshalIndent(findings, "", "  ")
		if err != nil {
			fatal("check: encode json: %v", err)
		}
		fmt.Println(string(encoded))
	} else {
		for _, finding := range findings {
			fmt.Printf("%s:%s\n", finding.File, enrichment.FormatFinding(finding.Finding))
		}
	}

	fmt.Fprintf(os.Stderr, "check: 1 file(s), %d finding(s)\n", len(findings))
	if hasError {
		return 1
	}
	return 0
}

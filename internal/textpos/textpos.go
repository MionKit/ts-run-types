// Package textpos converts byte offsets in a parsed source file into
// 1-based line/column coordinates and diag.Site spans. Shared by the
// resolver and the purefns extractor (which must not import the
// resolver); diag itself stays ast-free, so the helpers live here.
package textpos

import (
	"sort"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-runtypes/internal/diag"
)

// LineCol returns (1-based line, 1-based column) for byte offset pos
// inside sourceFile. Backed by the SourceFile's lazily-computed (and
// per-file cached) ECMA line map + binary search — re-walking the
// file's bytes on every call made per-dispatch provenance
// O(sites × file size).
func LineCol(sourceFile *ast.SourceFile, pos int) (int, int) {
	if pos > len(sourceFile.Text()) {
		pos = len(sourceFile.Text())
	}
	lineMap := sourceFile.ECMALineMap()
	// Greatest index whose line start is <= pos.
	idx := sort.Search(len(lineMap), func(i int) bool { return int(lineMap[i]) > pos }) - 1
	if idx < 0 {
		return 1, pos + 1
	}
	return idx + 1, pos - int(lineMap[idx]) + 1
}

// NodeSite builds a 1-based diag.Site spanning node's start/end.
// filePath is caller-supplied: the resolver reports request-normalized
// paths while the purefns extractor uses the SourceFile's own name.
func NodeSite(filePath string, sourceFile *ast.SourceFile, node *ast.Node) diag.Site {
	if sourceFile == nil || node == nil {
		return diag.Site{}
	}
	startLine, startCol := LineCol(sourceFile, node.Pos())
	endLine, endCol := LineCol(sourceFile, node.End())
	return diag.Site{FilePath: filePath, StartLine: startLine, StartCol: startCol, EndLine: endLine, EndCol: endCol}
}

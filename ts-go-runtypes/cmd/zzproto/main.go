package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
)

func main() {
	pkgRoot, _ := filepath.Abs("../packages/ts-runtypes")
	files := []string{
		filepath.Join(pkgRoot, "src/runtypes/pure-fns-utils.ts"),
		filepath.Join(pkgRoot, "src/formats/string/string-formats-pure-fns.ts"),
		filepath.Join(pkgRoot, "src/formats/datetime/dateTime-pure-fns.ts"),
	}
	prog, err := program.NewInferred(program.Options{Cwd: pkgRoot}, files)
	if err != nil {
		fmt.Fprintln(os.Stderr, "program:", err)
		os.Exit(1)
	}
	checker, release := prog.TS.GetTypeChecker(context.Background())
	defer release()
	markerOpts := marker.WithDefaults(marker.Options{})
	markerOpts.FS = prog.FS
	entries, diags := purefunctions.ExtractFromProgramCached(checker, markerOpts, prog, files, purefunctions.NewFileCache())
	fmt.Printf("entries=%d diags=%d\n", len(entries), len(diags))
	for _, e := range entries {
		fmt.Printf("  %-40s params=%v deps=%v hash=%s codelen=%d\n", e.Key(), e.ParamNames, e.PureFnDependencies, e.BodyHash, len(e.Code))
	}
	for _, d := range diags {
		fmt.Printf("  DIAG %s: %s\n", d.Code, d.Args)
	}
}

// gen-run-type-kind regenerates the TS mirror of ReflectionKind and
// ReflectionSubKind from internal/protocol/protocol.go and
// internal/protocol/subkind.go. The const declarations are parsed
// from the Go AST — there's no hand-maintained list of kind names in
// this program, so adding a new Kind* or SubKind* in protocol/ flows
// through to the JS-side without touching the generator.
//
// The numeric discriminator values MUST match the Go binary's wire
// output byte-for-byte — JS-side consumers dispatch on these to read
// runTypesCache nodes, so any drift silently breaks the JS half. A
// companion test (`gen_test.go`) asserts the committed TS file is in
// sync with the generator's current output.
//
// Run:
//
//	go run ./cmd/gen-run-type-kind > packages/ts-runtypes/src/runTypeKind.ts
//
// Or via the pnpm script:
//
//	pnpm run gen:run-type-kind
package main

import (
	"fmt"
	"log"
	"os"
)

func main() {
	body, err := Generate()
	if err != nil {
		log.Fatalf("gen-run-type-kind: %v", err)
	}
	if _, err := fmt.Fprint(os.Stdout, body); err != nil {
		log.Fatalf("gen-run-type-kind: write stdout: %v", err)
	}
}

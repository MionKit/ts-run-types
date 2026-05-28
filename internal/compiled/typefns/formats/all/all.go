// Package all blank-imports every concrete format-emitter package so
// their init()s register with the formats.Registry. Importing this
// package once from main.go (or any always-included package) is the
// single point where new format subtrees get wired up.
//
// Keep imports alphabetically sorted within each kind block; comment
// each line so a future maintainer can match the Go import to the JS
// runtype it shadows.
package all

import (
	// String-family emitters. JS-side mirrors live under
	// `packages/ts-go-type-formats/src/string/`.
	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/string"
)

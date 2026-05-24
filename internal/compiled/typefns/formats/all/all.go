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
	// Numeric-family emitters (numberFormat + bigintFormat). JS-side
	// mirrors live at `packages/ts-go-run-types/src/formats/numberFormats.ts`
	// and `bigintFormats.ts`. One import registers both via their init()s.
	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/numeric"
	// String-family emitters. JS-side mirrors live under
	// `packages/ts-go-run-types/src/formats/string/`.
	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/string"
)

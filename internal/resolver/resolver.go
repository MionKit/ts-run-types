// Package resolver is the session orchestrator. It owns a tsgo Program +
// checker pool and dispatches incoming protocol ops across the three
// cache generators under internal/compiled/:
//
//   - runtype:  resolves call-site type queries, deduplicates serialized
//     RunType records, and emits the runTypes cache module.
//   - typefns: precompiles `isType` validators for cached RunTypes the
//     emitter supports.
//   - purefns: extracts `registerPureFnFactory(...)` bodies and emits
//     the pureFns cache module.
//
// Per-op handlers live in dispatch.go; scanning helpers in scan.go;
// per-file scope projection in scope.go; cache-module rendering and
// wire-shape conversions in render.go.
package resolver

import (
	"context"
	"errors"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Options controls the resolver's hash budget and the marker-detection
// parameters threaded through to scanFiles.
type Options struct {
	HashLength        int
	LiteralHashLength int
	// Marker selects which type alias the scanner treats as the
	// transformer's id-injection sentinel. Zero values default to
	// `InjectRuntypeId` from `@mionjs/ts-go-run-types`.
	Marker marker.Options
	// Cwd is the working directory used when SetSources builds an inferred
	// Program. Required for server-mode resolvers; ignored when a Program
	// is supplied to New(). When unset, SetSources falls back to the
	// existing Program's GetCurrentDirectory.
	Cwd string
	// SingleThreaded forces single-checker mode on Programs built by
	// SetSources. Mirrors program.Options.SingleThreaded.
	SingleThreaded bool
	// CacheDir, when non-empty, points at a directory under which the
	// resolver persists per-(typeID, fnTag) JIT artifacts. Typically
	// <projectRoot>/node_modules/.cache/ts-go-run-types. The disk layer
	// fingerprints non-version build options (hash lengths, marker
	// settings) into a subdirectory so distinct configurations don't
	// share cache entries; binary version is folded into the typeID
	// hash so cross-version files never collide. Empty disables caching
	// (the in-memory walker runs every time, matching test mode).
	CacheDir string
	// EmitCreateJitFn opts every typefns module renderer into emitting
	// the inline `createJitFn` closure alongside the body `code`
	// string. Default false — the JS-side materializeJitFn rebuilds
	// the factory from `code` via `new Function('utl', code)` on first
	// lookup, saving the per-entry duplication of the body wrapped in
	// `function g_<hash>(utl){…}`. Set true for secure runtimes
	// (Cloudflare WorkerD, sandboxed iframes, browser CSP without
	// `unsafe-eval`) that disallow dynamic-code construction. The
	// vitest configs set this true so the test suite covers both the
	// inline-factory path (via createIsType<T>) and the new-Function
	// path (via deserializeIsType<T>) on every case.
	EmitCreateJitFn bool
}

// Resolver owns a Program and answers type queries against it. The serializer
// cache is shared across queries so type ids stay stable in a single dump.
//
// Program-less resolvers (built via NewServer) are valid: they accept the
// setSources op to install a Program, then serve scanFiles / dump as normal.
// Subsequent setSources calls swap the Program in place — the structural
// type cache survives across swaps so dedup IDs stay stable.
type Resolver struct {
	Program      *program.Program
	cache        *runtype.Cache
	checker      *checker.Checker
	releaseLease func()
	sites        []protocol.Site
	marker       marker.Options
	opts         Options
	// pureFnHashes is the session-wide index of every pure-fn entry
	// the resolver has observed so far, keyed by "<ns>::<fnName>" with
	// the entry's bodyHash as the value. Used by dispatchScanFiles to
	// emit `AddedPureFns` on the wire — the Vite plugin reads that
	// signal in handleHotUpdate to decide whether the pureFns cache
	// module needs invalidating after a user-file change.
	pureFnHashes map[string]string
	// scannedFiles tracks every file the resolver has scanned via
	// dispatchScanFiles, regardless of whether the scan found any
	// markers. Used by scanAllProgramFiles to avoid double-scanning
	// (which would duplicate site entries on resolver.sites). Cleared
	// alongside the cache + sites on Rebind / Clear.
	scannedFiles map[string]struct{}
	// jitStore is the on-disk JIT artifact cache shared by every
	// renderXxxModule call. nil when CacheDir was empty — the renderer
	// treats nil as "no cache wired", so test paths that build a
	// resolver without a CacheDir keep the original semantics.
	jitStore *disk.Store
}

// newJITStore builds the on-disk store for opts, returning nil when
// caching is disabled. Centralised so New / NewServer share the same
// fingerprinting rules.
func newJITStore(opts Options) *disk.Store {
	if opts.CacheDir == "" {
		return nil
	}
	fp := disk.Fingerprint(disk.FingerprintInputs{
		HashLength:        opts.HashLength,
		LiteralHashLength: opts.LiteralHashLength,
		EmitCreateJitFn:   opts.EmitCreateJitFn,
	})
	return disk.New(opts.CacheDir, fp)
}

// JITStore returns the on-disk JIT artifact cache, or nil when
// disabled. Render-side wrappers read this to build the RenderOpts
// they pass into the typefns module renderers.
func (resolver *Resolver) JITStore() *disk.Store {
	if resolver == nil {
		return nil
	}
	return resolver.jitStore
}

// New builds a Resolver against prog. Defaults to hashid's default lengths when
// HashLength / LiteralHashLength are zero.
func New(prog *program.Program, opts Options) (*Resolver, error) {
	if prog == nil || prog.TS == nil {
		return nil, errors.New("resolver.New: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return nil, errors.New("resolver.New: no checker available")
	}
	return &Resolver{
		Program: prog,
		cache: runtype.NewCache(typeChecker, runtype.Options{
			HashLength:        opts.HashLength,
			LiteralHashLength: opts.LiteralHashLength,
		}),
		checker:      typeChecker,
		releaseLease: releaseLease,
		marker:       marker.WithDefaults(opts.Marker),
		opts:         opts,
		pureFnHashes: map[string]string{},
		scannedFiles: map[string]struct{}{},
		jitStore:     newJITStore(opts),
	}, nil
}

// NewServer builds a Resolver with no Program. Callers (the --inline-server
// CLI path) install one later via the setSources op. The cache is created
// up front with a nil checker; Rebind is called on first SetProgram.
func NewServer(opts Options) *Resolver {
	return &Resolver{
		cache: runtype.NewCache(nil, runtype.Options{
			HashLength:        opts.HashLength,
			LiteralHashLength: opts.LiteralHashLength,
		}),
		marker:       marker.WithDefaults(opts.Marker),
		opts:         opts,
		pureFnHashes: map[string]string{},
		scannedFiles: map[string]struct{}{},
		jitStore:     newJITStore(opts),
	}
}

// SetProgram swaps the underlying Program. Releases the previous checker,
// leases a new one from prog, rebinds the cache, and resets the sites slice
// (positions are tied to the old source text). The cache's structural dedup
// table survives the swap so equivalent types reuse their ids.
func (resolver *Resolver) SetProgram(prog *program.Program) error {
	if prog == nil || prog.TS == nil {
		return errors.New("resolver.SetProgram: program is nil")
	}
	typeChecker, releaseLease := prog.TS.GetTypeChecker(context.Background())
	if typeChecker == nil {
		releaseLease()
		return errors.New("resolver.SetProgram: no checker available")
	}
	if resolver.releaseLease != nil {
		resolver.releaseLease()
	}
	resolver.Program = prog
	resolver.checker = typeChecker
	resolver.releaseLease = releaseLease
	resolver.cache.Rebind(typeChecker)
	resolver.sites = resolver.sites[:0]
	resolver.scannedFiles = map[string]struct{}{}
	return nil
}

// Reset wipes ALL user-supplied resolver state: every interned Type, the
// sites list, the Program, the checker lease, and (because the overlay
// lives inside the Program) the in-memory source map. Equivalent to
// throwing the Resolver away and replacing it with a fresh NewServer —
// except the goroutine / connection stays open. After reset, the resolver
// requires a new setSources before scanFiles will work.
//
// Lib files (lib.d.ts, bundled tsgo declarations) live behind the
// cachedvfs layer in program.New / program.NewInferred — they are byte-
// cached at the FS level and are NOT re-read from disk on the next
// setSources. Only the user's overlay + parsed-AST state is discarded here.
func (resolver *Resolver) Reset() {
	if resolver.releaseLease != nil {
		resolver.releaseLease()
		resolver.releaseLease = nil
	}
	resolver.Program = nil
	resolver.checker = nil
	resolver.cache.Clear()
	resolver.cache.Rebind(nil)
	resolver.sites = resolver.sites[:0]
	resolver.pureFnHashes = map[string]string{}
	resolver.scannedFiles = map[string]struct{}{}
}

func (resolver *Resolver) Close() {
	if resolver.releaseLease != nil {
		resolver.releaseLease()
		resolver.releaseLease = nil
	}
}

func (resolver *Resolver) Cache() *runtype.Cache { return resolver.cache }

// Sites returns the running list of resolved call-site ids. Callers (CLI,
// plugin) read this at end-of-build to write out the manifest.
func (resolver *Resolver) Sites() []protocol.Site {
	return append([]protocol.Site(nil), resolver.sites...)
}

// Package resolver is the session orchestrator. It owns a tsgo Program +
// checker pool and dispatches incoming protocol ops across the three
// cache generators under internal/compiled/:
//
//   - runtype:  resolves call-site type queries, deduplicates serialized
//     RunType records, and emits the runTypes cache module.
//   - typefns: precompiles `validate` validators for cached RunTypes the
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
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Options controls the resolver's hash budget and the marker-detection
// parameters threaded through to scanFiles.
type Options struct {
	HashLength int
	// Marker selects which type alias the scanner treats as the
	// transformer's id-injection sentinel. Zero values default to
	// `InjectRunTypeId` from `@mionjs/ts-go-run-types`.
	Marker marker.Options
	// Cwd is the working directory used when SetSources builds an inferred
	// Program. Required for server-mode resolvers; ignored when a Program
	// is supplied to New(). When unset, SetSources falls back to the
	// existing Program's GetCurrentDirectory.
	Cwd string
	// SingleThreaded forces single-checker mode on Programs built by
	// SetSources. Mirrors program.Options.SingleThreaded. Also forces the
	// serial scan path (a one-checker pool has nothing to fan out over).
	SingleThreaded bool
	// DisableParallelScan forces the serial marker-scan path. The zero
	// value means parallel-on (same default-true idiom as SingleThreaded):
	// scanFiles requests whose files span more than one pool checker group
	// run the checker-bound analysis concurrently across the pool, then
	// commit serially in request order. The serial path remains the
	// automatic fallback for single-group requests, single files, and
	// file-resolve errors.
	DisableParallelScan bool
	// DisableParallelRender forces the sequential family-render loop. The
	// zero value means parallel-on: the requested non-validate cache
	// families render concurrently (each against sharded per-dispatch
	// memos, merged at the join), validate always renders last and
	// serially. SingleThreaded implies serial here too.
	DisableParallelRender bool
	// CacheDir, when non-empty, points at a directory under which the
	// resolver persists per-(typeID, fnTag) RT artifacts. Typically
	// <projectRoot>/node_modules/.cache/ts-go-run-types. The disk layer
	// fingerprints non-version build options (hash lengths, marker
	// settings) into a subdirectory so distinct configurations don't
	// share cache entries; binary version is folded into the typeID
	// hash so cross-version files never collide. Empty disables caching
	// (the in-memory walker runs every time, matching test mode).
	CacheDir string
	// EmitMode selects what every typefns module renderer ships in its
	// code/factory slots: EmitCode (default) ships only the body `code`
	// string (the runtime rebuilds the factory via `new Function('utl',
	// code)` on first lookup); EmitFunctions ships only the live
	// `function g_<hash>(utl){…}` factory (code derived lazily if read);
	// EmitBoth ships both, for secure runtimes (Cloudflare WorkerD,
	// sandboxed iframes, browser CSP without `unsafe-eval`) that disallow
	// dynamic-code construction yet read `.code`. The vitest configs set
	// EmitBoth so the suite covers both the inline-factory path (via
	// createValidate<T>) and the new-Function path (via
	// deserializeValidate<T>) on every case.
	EmitMode constants.EmitMode
	// InlineMode selects the child-inlining policy (constants.InlineMode,
	// --inline-mode): default keeps compounds external; allInternal inlines
	// unnamed, non-circular compounds into their parents.
	InlineMode constants.InlineMode
	// ModuleMode selects how cache entries group into virtual modules:
	// constants.ModuleModeDefault (or empty — runtype bundle + per-entry fn
	// modules), ModuleModeAllSingle (per-family bundles, fewest modules), or
	// ModuleModeAllModules (per-node runtype modules too — the pre-bundle
	// layout). Validated at the CLI boundary; unknown values behave as
	// default.
	ModuleMode string
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
	// pureFnFileCache memoizes per-file pure-fn extraction for the
	// lifetime of the current Program (files are immutable within one
	// Program). The OpDump path used to re-extract EVERY program file on
	// EVERY dump; with the cache only never-seen files pay the AST walk.
	// Dropped on SetProgram / Reset together with the Program.
	pureFnFileCache *purefns.FileCache
	// verdictsByChecker memoizes marker.DetectAny by parameter type
	// pointer, one memo per pool checker. The scanner runs DetectAny for
	// every parameter of every resolved call signature — five spec checks
	// each with a brand-property checker lookup — and the same param
	// types repeat across call sites constantly. Pure function of
	// (checker, type, opts). Keyed per checker because each pool checker
	// materializes its own *checker.Type universe (upstream contract:
	// types from different checkers must never mix); the whole map dies
	// with the Program (SetProgram / Reset).
	verdictsByChecker map[*checker.Checker]map[*checker.Type]markerVerdict
	// rtStore is the on-disk RT artifact cache shared by every
	// renderXxxModule call. nil when CacheDir was empty — the renderer
	// treats nil as "no cache wired", so test paths that build a
	// resolver without a CacheDir keep the original semantics.
	rtStore *disk.Store
}

// markerVerdict is one memoized marker.DetectAny result. typeArg is the
// brand's first type argument when matched (nil otherwise).
type markerVerdict struct {
	kind    marker.Kind
	typeArg *checker.Type
	matched bool
}

// verdictsFor returns (creating on first use) the marker-verdict memo for
// scanChecker — see the verdictsByChecker field doc. Callers resolve the
// memo once per scan pass, not per call, so the outer map lookup never
// sits on the hot path. NOT safe for concurrent use: parallel scans must
// pre-create every group's memo on the dispatch goroutine before fanning
// out.
func (resolver *Resolver) verdictsFor(scanChecker *checker.Checker) map[*checker.Type]markerVerdict {
	if resolver.verdictsByChecker == nil {
		resolver.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
	}
	verdicts, ok := resolver.verdictsByChecker[scanChecker]
	if !ok {
		verdicts = map[*checker.Type]markerVerdict{}
		resolver.verdictsByChecker[scanChecker] = verdicts
	}
	return verdicts
}

// newRTStore builds the on-disk store for opts, returning nil when
// caching is disabled. Centralised so New / NewServer share the same
// fingerprinting rules.
func newRTStore(opts Options) *disk.Store {
	if opts.CacheDir == "" {
		return nil
	}
	fp := disk.Fingerprint(disk.FingerprintInputs{
		HashLength: opts.HashLength,
		EmitMode:   string(opts.EmitMode),
		InlineMode: string(opts.InlineMode),
	})
	return disk.New(opts.CacheDir, fp)
}

// RTStore returns the on-disk RT artifact cache, or nil when
// disabled. Render-side wrappers read this to build the RenderOpts
// they pass into the typefns module renderers.
func (resolver *Resolver) RTStore() *disk.Store {
	if resolver == nil {
		return nil
	}
	return resolver.rtStore
}

// New builds a Resolver against prog. Defaults to hashid's default length when
// HashLength is zero.
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
			HashLength: opts.HashLength,
		}),
		checker:           typeChecker,
		releaseLease:      releaseLease,
		marker:            marker.WithDefaults(opts.Marker),
		opts:              opts,
		pureFnHashes:      map[string]string{},
		scannedFiles:      map[string]struct{}{},
		pureFnFileCache:   purefns.NewFileCache(),
		verdictsByChecker: map[*checker.Checker]map[*checker.Type]markerVerdict{},
		rtStore:           newRTStore(opts),
	}, nil
}

// NewServer builds a Resolver with no Program. Callers (the --inline-server
// CLI path) install one later via the setSources op. The cache is created
// up front with a nil checker; Rebind is called on first SetProgram.
func NewServer(opts Options) *Resolver {
	return &Resolver{
		cache: runtype.NewCache(nil, runtype.Options{
			HashLength: opts.HashLength,
		}),
		marker:            marker.WithDefaults(opts.Marker),
		opts:              opts,
		pureFnHashes:      map[string]string{},
		scannedFiles:      map[string]struct{}{},
		pureFnFileCache:   purefns.NewFileCache(),
		verdictsByChecker: map[*checker.Checker]map[*checker.Type]markerVerdict{},
		rtStore:           newRTStore(opts),
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
	resolver.pureFnFileCache = purefns.NewFileCache()
	resolver.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
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
	resolver.pureFnFileCache = purefns.NewFileCache()
	resolver.verdictsByChecker = map[*checker.Checker]map[*checker.Type]markerVerdict{}
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

// markerModule returns the package the marker brands are declared in (the
// first configured spec's Module, defaulting to marker.DefaultModule). Passed
// to builders.IsSchemaLeafCall as the module gate.
func (resolver *Resolver) markerModule() string {
	for _, spec := range resolver.marker.Specs {
		if spec.Module != "" {
			return spec.Module
		}
	}
	return marker.DefaultModule
}

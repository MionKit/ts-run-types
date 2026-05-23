package resolver

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Dispatch routes a request to the correct handler.
func (resolver *Resolver) Dispatch(request protocol.Request) protocol.Response {
	before := resolver.cache.Size()
	switch request.Op {
	case protocol.OpScanFiles:
		if resolver.Program == nil {
			return protocol.Response{Error: "scanFiles: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "scanFiles: files is required and must be non-empty"}
		}
		sites, markerDiagnostics, err := resolver.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		added := resolver.cache.Added(before)
		// Per-cache "did this scan change anything?" signals consumed by
		// the Vite plugin's handleHotUpdate.
		addedRunTypes := len(added) > 0
		addedIsType := addedRunTypes && typefns.AnyIsTypeSupported(added)
		addedTypeErrors := addedRunTypes && typefns.AnyTypeErrorsSupported(added)
		addedPrepareForJson := addedRunTypes && typefns.AnyPrepareForJsonSupported(added)
		addedRestoreFromJson := addedRunTypes && typefns.AnyRestoreFromJsonSupported(added)
		addedStringifyJson := addedRunTypes && typefns.AnyStringifyJsonSupported(added)
		addedPrepareForJsonSafe := addedRunTypes && typefns.AnyPrepareForJsonSafeSupported(added)
		addedPrepareForJsonSafePreserve := addedRunTypes && typefns.AnyPrepareForJsonSafePreserveSupported(added)
		addedHasUnknownKeys := addedRunTypes && typefns.AnyHasUnknownKeysSupported(added)
		addedStripUnknownKeys := addedRunTypes && typefns.AnyStripUnknownKeysSupported(added)
		addedUnknownKeyErrors := addedRunTypes && typefns.AnyUnknownKeyErrorsSupported(added)
		addedUnknownKeysToUndefined := addedRunTypes && typefns.AnyUnknownKeysToUndefinedSupported(added)
		addedUnknownKeysToUndefinedWire := addedRunTypes && typefns.AnyUnknownKeysToUndefinedWireSupported(added)
		addedToBinary := addedRunTypes && typefns.AnyToBinarySupported(added)
		addedFromBinary := addedRunTypes && typefns.AnyFromBinarySupported(added)
		// Pure-fn extraction runs every scanFiles call: the request's
		// files may add or modify registerPureFnFactory calls without
		// producing any new RunTypes, AND every accepted entry yields
		// one Replacement record the Vite plugin uses to null out the
		// factory argument in the user's source. Diagnostics flow
		// unconditionally so editor surfaces update as the user types.
		pureFnEntries, pureFnDiagnostics, pureFnReplacements, addedPureFns := resolver.extractPureFnsForScan(request.Files)
		combinedDiagnostics := append(append([]diag.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...)
		// jitDiagnostics is the sink the walker appends to at every
		// JitThrow / silent-skip site reached during the cache renders
		// below. Single sink covers every render in this dispatch so a
		// single shared throw-site emits one diag per call site.
		var jitDiagnostics []diag.Diagnostic
		jitOpts := resolver.jitRenderOpts(&jitDiagnostics, resolver.buildProvenanceSites())
		response := protocol.Response{
			Sites:                           sites,
			Replacements:                    pureFnReplacements,
			Added:                           added,
			AddedRunTypes:                   addedRunTypes,
			AddedIsType:                     addedIsType,
			AddedTypeErrors:                 addedTypeErrors,
			AddedPrepareForJson:             addedPrepareForJson,
			AddedRestoreFromJson:            addedRestoreFromJson,
			AddedStringifyJson:              addedStringifyJson,
			AddedPrepareForJsonSafe:         addedPrepareForJsonSafe,
			AddedPrepareForJsonSafePreserve: addedPrepareForJsonSafePreserve,
			AddedHasUnknownKeys:             addedHasUnknownKeys,
			AddedStripUnknownKeys:           addedStripUnknownKeys,
			AddedUnknownKeyErrors:           addedUnknownKeyErrors,
			AddedUnknownKeysToUndefined:     addedUnknownKeysToUndefined,
			AddedUnknownKeysToUndefinedWire: addedUnknownKeysToUndefinedWire,
			AddedToBinary:                   addedToBinary,
			AddedFromBinary:                 addedFromBinary,
			AddedPureFns:                    addedPureFns,
			Diagnostics:                     combinedDiagnostics,
		}
		wantRunType := wantsCache(request.IncludeCacheSources, protocol.CacheKindRunType)
		wantIsType := wantsCache(request.IncludeCacheSources, protocol.CacheKindIsType)
		wantTypeErrors := wantsCache(request.IncludeCacheSources, protocol.CacheKindTypeErrors)
		wantPrepareForJson := wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJson)
		wantRestoreFromJson := wantsCache(request.IncludeCacheSources, protocol.CacheKindRestoreFromJson)
		wantStringifyJson := wantsCache(request.IncludeCacheSources, protocol.CacheKindStringifyJson)
		wantPrepareForJsonSafe := wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJsonSafe)
		wantPrepareForJsonSafePreserve := wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJsonSafePreserve)
		wantHasUnknownKeys := wantsCache(request.IncludeCacheSources, protocol.CacheKindHasUnknownKeys)
		wantStripUnknownKeys := wantsCache(request.IncludeCacheSources, protocol.CacheKindStripUnknownKeys)
		wantUnknownKeyErrors := wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeyErrors)
		wantUnknownKeysToUndefined := wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeysToUndefined)
		wantUnknownKeysToUndefinedWire := wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeysToUndefinedWire)
		wantToBinary := wantsCache(request.IncludeCacheSources, protocol.CacheKindToBinary)
		wantFromBinary := wantsCache(request.IncludeCacheSources, protocol.CacheKindFromBinary)
		wantPureFns := wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns)
		anyCache := wantRunType || wantIsType || wantTypeErrors || wantPrepareForJson || wantRestoreFromJson ||
			wantStringifyJson || wantPrepareForJsonSafe || wantPrepareForJsonSafePreserve ||
			wantHasUnknownKeys || wantStripUnknownKeys || wantUnknownKeyErrors ||
			wantUnknownKeysToUndefined || wantUnknownKeysToUndefinedWire ||
			wantToBinary || wantFromBinary || wantPureFns
		if request.IncludeRunTypes || anyCache {
			scoped := resolver.scopedDump(request.Files)
			if request.IncludeRunTypes {
				response.RunTypes = scoped.RunTypes
			}
			if wantRunType {
				rendered, renderErr := renderRunTypesModule(scoped)
				if renderErr != nil {
					return protocol.Response{Error: renderErr.Error()}
				}
				response.RunTypeCacheSource = rendered
			}
			if wantIsType {
				isTypeRendered, isTypeErr := renderIsTypeModule(scoped, jitOpts)
				if isTypeErr != nil {
					return protocol.Response{Error: isTypeErr.Error()}
				}
				response.IsTypeCacheSource = isTypeRendered
			}
			if wantTypeErrors {
				typeErrorsRendered, typeErrorsErr := renderTypeErrorsModule(scoped, jitOpts)
				if typeErrorsErr != nil {
					return protocol.Response{Error: typeErrorsErr.Error()}
				}
				response.TypeErrorsCacheSource = typeErrorsRendered
			}
			if wantPrepareForJson {
				prepareRendered, prepareErr := renderPrepareForJsonModule(scoped, jitOpts)
				if prepareErr != nil {
					return protocol.Response{Error: prepareErr.Error()}
				}
				response.PrepareForJsonCacheSource = prepareRendered
			}
			if wantRestoreFromJson {
				restoreRendered, restoreErr := renderRestoreFromJsonModule(scoped, jitOpts)
				if restoreErr != nil {
					return protocol.Response{Error: restoreErr.Error()}
				}
				response.RestoreFromJsonCacheSource = restoreRendered
			}
			if wantStringifyJson {
				stringifyRendered, stringifyErr := renderStringifyJsonModule(scoped, jitOpts)
				if stringifyErr != nil {
					return protocol.Response{Error: stringifyErr.Error()}
				}
				response.StringifyJsonCacheSource = stringifyRendered
			}
			if wantPrepareForJsonSafe {
				rendered, err := renderPrepareForJsonSafeModule(scoped, jitOpts)
				if err != nil {
					return protocol.Response{Error: err.Error()}
				}
				response.PrepareForJsonSafeCacheSource = rendered
			}
			if wantPrepareForJsonSafePreserve {
				rendered, err := renderPrepareForJsonSafePreserveModule(scoped, jitOpts)
				if err != nil {
					return protocol.Response{Error: err.Error()}
				}
				response.PrepareForJsonSafePreserveCacheSource = rendered
			}
			if wantHasUnknownKeys {
				hukRendered, hukErr := renderHasUnknownKeysModule(scoped, jitOpts)
				if hukErr != nil {
					return protocol.Response{Error: hukErr.Error()}
				}
				response.HasUnknownKeysCacheSource = hukRendered
			}
			if wantStripUnknownKeys {
				sukRendered, sukErr := renderStripUnknownKeysModule(scoped, jitOpts)
				if sukErr != nil {
					return protocol.Response{Error: sukErr.Error()}
				}
				response.StripUnknownKeysCacheSource = sukRendered
			}
			if wantUnknownKeyErrors {
				ukeRendered, ukeErr := renderUnknownKeyErrorsModule(scoped, jitOpts)
				if ukeErr != nil {
					return protocol.Response{Error: ukeErr.Error()}
				}
				response.UnknownKeyErrorsCacheSource = ukeRendered
			}
			if wantUnknownKeysToUndefined {
				ukuRendered, ukuErr := renderUnknownKeysToUndefinedModule(scoped, jitOpts)
				if ukuErr != nil {
					return protocol.Response{Error: ukuErr.Error()}
				}
				response.UnknownKeysToUndefinedCacheSource = ukuRendered
			}
			if wantUnknownKeysToUndefinedWire {
				ukuwRendered, ukuwErr := renderUnknownKeysToUndefinedWireModule(scoped, jitOpts)
				if ukuwErr != nil {
					return protocol.Response{Error: ukuwErr.Error()}
				}
				response.UnknownKeysToUndefinedWireCacheSource = ukuwRendered
			}
			if wantToBinary {
				rendered, err := renderToBinaryModule(scoped, jitOpts)
				if err != nil {
					return protocol.Response{Error: err.Error()}
				}
				response.ToBinaryCacheSource = rendered
			}
			if wantFromBinary {
				rendered, err := renderFromBinaryModule(scoped, jitOpts)
				if err != nil {
					return protocol.Response{Error: err.Error()}
				}
				response.FromBinaryCacheSource = rendered
			}
			if wantPureFns {
				pureFnsRendered, _, pureFnsErr := renderPureFnsModule(resolver.checker, resolver.marker, resolver.Program, pureFnEntries, true)
				if pureFnsErr != nil {
					return protocol.Response{Error: pureFnsErr.Error()}
				}
				response.PureFnsCacheSource = pureFnsRendered
			}
		}
		// Flush JIT diagnostics into the unified response.Diagnostics slice
		// so the Vite plugin's reception loop surfaces them via this.warn.
		response.Diagnostics = append(response.Diagnostics, jitDiagnostics...)
		return response
	case protocol.OpDump:
		// Ensure every source file in the Program has been scanned for
		// marker calls before the dump is serialized. Without this,
		// the Vite plugin's cache module transform — which fires on
		// the first import of any cache file — may run BEFORE the
		// user's marker-bearing source files have been transformed
		// (and therefore scanned). The cache module would then be
		// rendered with an empty `init(...)` body, even though the
		// runtypes will appear in the resolver state moments later.
		// The eager scan amortises any per-file scan that hasn't
		// happened yet, so OpDump always returns the complete picture.
		if resolver.Program != nil {
			resolver.scanAllProgramFiles()
		}
		fullDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.Sites(),
		}
		response := protocol.Response{
			RunTypes: fullDump.RunTypes,
			Sites:    fullDump.Sites,
		}
		// jitDiagnostics is the JIT-render diagnostic sink for this dump.
		// Mirrors the OpScanFiles branch — one sink shared across every
		// per-kind render, flushed into response.Diagnostics once all
		// renders have completed.
		var jitDiagnostics []diag.Diagnostic
		jitOpts := resolver.jitRenderOpts(&jitDiagnostics, resolver.buildProvenanceSites())
		// Per-kind opt-in mirrors OpScanFiles. When IncludeCacheSources is
		// omitted, callers get every cache source (legacy "give me
		// everything" behavior preserved). When set, only the requested
		// kinds are rendered — lets the Vite plugin's transform() ask
		// for just the one cache it's serving in this hook call.
		noFilter := len(request.IncludeCacheSources) == 0
		wantRunType := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindRunType)
		wantIsType := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindIsType)
		wantTypeErrors := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindTypeErrors)
		wantPrepareForJson := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJson)
		wantRestoreFromJson := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindRestoreFromJson)
		wantStringifyJson := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindStringifyJson)
		wantPrepareForJsonSafe := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJsonSafe)
		wantPrepareForJsonSafePreserve := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPrepareForJsonSafePreserve)
		wantHasUnknownKeys := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindHasUnknownKeys)
		wantStripUnknownKeys := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindStripUnknownKeys)
		wantUnknownKeyErrors := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeyErrors)
		wantUnknownKeysToUndefined := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeysToUndefined)
		wantUnknownKeysToUndefinedWire := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindUnknownKeysToUndefinedWire)
		wantToBinary := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindToBinary)
		wantFromBinary := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindFromBinary)
		wantPureFns := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns)
		if wantRunType {
			rendered, renderErr := renderRunTypesModule(fullDump)
			if renderErr != nil {
				return protocol.Response{Error: renderErr.Error()}
			}
			response.RunTypeCacheSource = rendered
		}
		if wantIsType {
			isTypeRendered, isTypeErr := renderIsTypeModule(fullDump, jitOpts)
			if isTypeErr != nil {
				return protocol.Response{Error: isTypeErr.Error()}
			}
			response.IsTypeCacheSource = isTypeRendered
		}
		if wantTypeErrors {
			typeErrorsRendered, typeErrorsErr := renderTypeErrorsModule(fullDump, jitOpts)
			if typeErrorsErr != nil {
				return protocol.Response{Error: typeErrorsErr.Error()}
			}
			response.TypeErrorsCacheSource = typeErrorsRendered
		}
		if wantPrepareForJson {
			prepareRendered, prepareErr := renderPrepareForJsonModule(fullDump, jitOpts)
			if prepareErr != nil {
				return protocol.Response{Error: prepareErr.Error()}
			}
			response.PrepareForJsonCacheSource = prepareRendered
		}
		if wantRestoreFromJson {
			restoreRendered, restoreErr := renderRestoreFromJsonModule(fullDump, jitOpts)
			if restoreErr != nil {
				return protocol.Response{Error: restoreErr.Error()}
			}
			response.RestoreFromJsonCacheSource = restoreRendered
		}
		if wantStringifyJson {
			stringifyRendered, stringifyErr := renderStringifyJsonModule(fullDump, jitOpts)
			if stringifyErr != nil {
				return protocol.Response{Error: stringifyErr.Error()}
			}
			response.StringifyJsonCacheSource = stringifyRendered
		}
		if wantPrepareForJsonSafe {
			rendered, err := renderPrepareForJsonSafeModule(fullDump, jitOpts)
			if err != nil {
				return protocol.Response{Error: err.Error()}
			}
			response.PrepareForJsonSafeCacheSource = rendered
		}
		if wantPrepareForJsonSafePreserve {
			rendered, err := renderPrepareForJsonSafePreserveModule(fullDump, jitOpts)
			if err != nil {
				return protocol.Response{Error: err.Error()}
			}
			response.PrepareForJsonSafePreserveCacheSource = rendered
		}
		if wantHasUnknownKeys {
			hukRendered, hukErr := renderHasUnknownKeysModule(fullDump, jitOpts)
			if hukErr != nil {
				return protocol.Response{Error: hukErr.Error()}
			}
			response.HasUnknownKeysCacheSource = hukRendered
		}
		if wantStripUnknownKeys {
			sukRendered, sukErr := renderStripUnknownKeysModule(fullDump, jitOpts)
			if sukErr != nil {
				return protocol.Response{Error: sukErr.Error()}
			}
			response.StripUnknownKeysCacheSource = sukRendered
		}
		if wantUnknownKeyErrors {
			ukeRendered, ukeErr := renderUnknownKeyErrorsModule(fullDump, jitOpts)
			if ukeErr != nil {
				return protocol.Response{Error: ukeErr.Error()}
			}
			response.UnknownKeyErrorsCacheSource = ukeRendered
		}
		if wantUnknownKeysToUndefined {
			ukuRendered, ukuErr := renderUnknownKeysToUndefinedModule(fullDump, jitOpts)
			if ukuErr != nil {
				return protocol.Response{Error: ukuErr.Error()}
			}
			response.UnknownKeysToUndefinedCacheSource = ukuRendered
		}
		if wantUnknownKeysToUndefinedWire {
			ukuwRendered, ukuwErr := renderUnknownKeysToUndefinedWireModule(fullDump, jitOpts)
			if ukuwErr != nil {
				return protocol.Response{Error: ukuwErr.Error()}
			}
			response.UnknownKeysToUndefinedWireCacheSource = ukuwRendered
		}
		if wantToBinary {
			rendered, err := renderToBinaryModule(fullDump, jitOpts)
			if err != nil {
				return protocol.Response{Error: err.Error()}
			}
			response.ToBinaryCacheSource = rendered
		}
		if wantFromBinary {
			rendered, err := renderFromBinaryModule(fullDump, jitOpts)
			if err != nil {
				return protocol.Response{Error: err.Error()}
			}
			response.FromBinaryCacheSource = rendered
		}
		if wantPureFns {
			pureFnsRendered, pureFnsDiagnostics, pureFnsErr := renderPureFnsModule(resolver.checker, resolver.marker, resolver.Program, nil, false)
			if pureFnsErr != nil {
				return protocol.Response{Error: pureFnsErr.Error()}
			}
			response.PureFnsCacheSource = pureFnsRendered
			response.Diagnostics = append(response.Diagnostics, pureFnsDiagnostics...)
		}
		response.Diagnostics = append(response.Diagnostics, jitDiagnostics...)
		return response
	case protocol.OpSetSources:
		if err := resolver.dispatchSetSources(request.Sources); err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{OK: true}
	case protocol.OpReset:
		resolver.Reset()
		return protocol.Response{OK: true}
	case protocol.OpResolveID:
		runType := resolver.ResolveID(request.ID)
		if runType == nil {
			return protocol.Response{}
		}
		return protocol.Response{RunTypes: []*protocol.RunType{runType}}
	case protocol.OpTsCompile:
		ms, err := resolver.dispatchTsCompile()
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{TsCompileMs: ms}
	default:
		return protocol.Response{Error: "unknown op: " + request.Op}
	}
}

// ResolveID returns the canonical full Type for id, or nil if no such id
// has been interned. Child slots inside the returned Type remain KindRef
// sentinels — callers re-issue ResolveID per id to drill in.
func (resolver *Resolver) ResolveID(id string) *protocol.RunType {
	if id == "" {
		return nil
	}
	return resolver.cache.NodeByID(id)
}

// dispatchSetSources builds an inferred Program from the supplied overlay
// and swaps it into the resolver. Relative file names are resolved against
// the working directory the resolver's previous Program had (or, on first
// call before any Program exists, against os.Getwd at start — but we don't
// have that here; main passes an absCwd via Options for server mode).
func (resolver *Resolver) dispatchSetSources(sources map[string]string) error {
	if sources == nil {
		sources = map[string]string{}
	}
	cwd := resolver.opts.Cwd
	if cwd == "" && resolver.Program != nil {
		cwd = resolver.Program.TS.GetCurrentDirectory()
	}
	if cwd == "" {
		return errors.New("setSources: no cwd configured")
	}
	cwd = tspath.NormalizePath(cwd)
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for relativePath, content := range sources {
		absolutePath := tspath.ResolvePath(cwd, relativePath)
		overlay[absolutePath] = content
		fileNames = append(fileNames, absolutePath)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: resolver.opts.SingleThreaded,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		return fmt.Errorf("setSources: %w", err)
	}
	return resolver.SetProgram(prog)
}

// extractPureFnsForScan runs the pure-fn extractor once per scanFiles
// request and returns everything downstream code needs: the entries
// (so renderPureFnsModule doesn't extract a second time), the wire
// diagnostics, the byte-range replacements for the user's source
// (factory-arg-to-null), and a `changed` flag indicating that at
// least one entry's bodyHash differs from the session index.
//
// The session index (pureFnHashes) is mutated in place so subsequent
// scans see the new state. Removals are not detected here — a file
// that drops one of its pure-fn calls still leaves the session entry
// behind (matches the runTypes cache's structural-dedup contract;
// the orphan is harmless until the next process restart).
func (resolver *Resolver) extractPureFnsForScan(files []string) (entries []purefns.Entry, diagnostics []diag.Diagnostic, replacements []protocol.Replacement, changed bool) {
	if resolver.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, diagnostics = purefns.ExtractFromProgram(resolver.checker, resolver.marker, resolver.Program, files)
	for _, entry := range entries {
		key := entry.Key()
		if existing, ok := resolver.pureFnHashes[key]; !ok || existing != entry.BodyHash {
			resolver.pureFnHashes[key] = entry.BodyHash
			changed = true
		}
	}
	replacements = purefns.Replacements(entries)
	return entries, diagnostics, replacements, changed
}

// wantsCache reports whether a scanFiles caller asked for `kind` — either
// explicitly or via the CacheKindAll shortcut.
func wantsCache(requested []protocol.CacheKind, kind protocol.CacheKind) bool {
	for _, k := range requested {
		if k == kind || k == protocol.CacheKindAll {
			return true
		}
	}
	return false
}

// dispatchTsCompile runs the embedded tsgo through a full bind +
// typecheck + emit pass on the resolver's current Program. Returns the
// wall time in milliseconds. The emit output bytes are discarded — we
// only care about timing. Does NOT walk markers, does NOT render any
// ts-go-run-types cache modules — this is the pure-TypeScript baseline
// measurement the bench orchestrators record alongside the existing
// scanFiles latency.
func (resolver *Resolver) dispatchTsCompile() (float64, error) {
	if resolver.Program == nil || resolver.Program.TS == nil {
		return 0, errors.New("tsCompile: no Program loaded; call setSources first")
	}
	start := time.Now()
	// EmitOptions.WriteFile is the sink for emitted bytes. Discard
	// everything — the test is the timing, not the output.
	options := compiler.EmitOptions{
		WriteFile: func(_ string, _ string, _ *compiler.WriteFileData) error {
			// discard emit output — only the timing matters here
			return nil
		},
	}
	resolver.Program.TS.Emit(context.Background(), options)
	return float64(time.Since(start).Microseconds()) / 1000.0, nil
}

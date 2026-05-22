package resolver

import (
	"errors"
	"fmt"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/caches/jitfn"
	"github.com/mionkit/ts-run-types/internal/caches/purefn"
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
		sites, markerDiags, err := resolver.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		added := resolver.cache.Added(before)
		// Per-cache "did this scan change anything?" signals consumed by
		// the Vite plugin's handleHotUpdate.
		addedRunTypes := len(added) > 0
		addedIsType := addedRunTypes && jitfn.AnyIsTypeSupported(added)
		// Pure-fn extraction runs every scanFiles call: the request's
		// files may add or modify registerPureFnFactory calls without
		// producing any new RunTypes, AND every accepted entry yields
		// one Replacement record the Vite plugin uses to null out the
		// factory argument in the user's source. Diagnostics flow
		// unconditionally so editor surfaces update as the user types.
		pureFnEntries, pureFnDiags, pureFnReplacements, addedPureFns := resolver.extractPureFnsForScan(request.Files)
		response := protocol.Response{
			Sites:              sites,
			Replacements:       pureFnReplacements,
			Added:              added,
			AddedRunTypes:      addedRunTypes,
			AddedIsType:        addedIsType,
			AddedPureFns:       addedPureFns,
			PureFnsDiagnostics: pureFnDiags,
			MarkerDiagnostics:  markerDiags,
		}
		wantRunType := wantsCache(request.IncludeCacheSources, protocol.CacheKindRunType)
		wantIsType := wantsCache(request.IncludeCacheSources, protocol.CacheKindIsType)
		wantPureFns := wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns)
		anyCache := wantRunType || wantIsType || wantPureFns
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
				isTypeRendered, isTypeErr := renderIsTypeModule(scoped)
				if isTypeErr != nil {
					return protocol.Response{Error: isTypeErr.Error()}
				}
				response.IsTypeCacheSource = isTypeRendered
			}
			if wantPureFns {
				pureFnsRendered, _, pureFnsErr := renderPureFnsModule(resolver.Program, pureFnEntries, true)
				if pureFnsErr != nil {
					return protocol.Response{Error: pureFnsErr.Error()}
				}
				response.PureFnsCacheSource = pureFnsRendered
			}
		}
		return response
	case protocol.OpDump:
		fullDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.Sites(),
		}
		response := protocol.Response{
			RunTypes: fullDump.RunTypes,
			Sites:    fullDump.Sites,
		}
		// Per-kind opt-in mirrors OpScanFiles. When IncludeCacheSources is
		// omitted, callers get every cache source (legacy "give me
		// everything" behavior preserved). When set, only the requested
		// kinds are rendered — lets the Vite plugin's transform() ask
		// for just the one cache it's serving in this hook call.
		noFilter := len(request.IncludeCacheSources) == 0
		wantRunType := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindRunType)
		wantIsType := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindIsType)
		wantPureFns := noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns)
		if wantRunType {
			rendered, renderErr := renderRunTypesModule(fullDump)
			if renderErr != nil {
				return protocol.Response{Error: renderErr.Error()}
			}
			response.RunTypeCacheSource = rendered
		}
		if wantIsType {
			isTypeRendered, isTypeErr := renderIsTypeModule(fullDump)
			if isTypeErr != nil {
				return protocol.Response{Error: isTypeErr.Error()}
			}
			response.IsTypeCacheSource = isTypeRendered
		}
		if wantPureFns {
			pureFnsRendered, pureFnsDiags, pureFnsErr := renderPureFnsModule(resolver.Program, nil, false)
			if pureFnsErr != nil {
				return protocol.Response{Error: pureFnsErr.Error()}
			}
			response.PureFnsCacheSource = pureFnsRendered
			response.PureFnsDiagnostics = pureFnsDiags
		}
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
func (resolver *Resolver) extractPureFnsForScan(files []string) (entries []purefn.Entry, diags []protocol.PureFnDiagnostic, replacements []protocol.Replacement, changed bool) {
	if resolver.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, rawDiags := purefn.ExtractFromProgram(resolver.Program, files)
	for _, entry := range entries {
		key := entry.Key()
		if existing, ok := resolver.pureFnHashes[key]; !ok || existing != entry.BodyHash {
			resolver.pureFnHashes[key] = entry.BodyHash
			changed = true
		}
	}
	diags = make([]protocol.PureFnDiagnostic, 0, len(rawDiags))
	for _, diag := range rawDiags {
		diags = append(diags, toWireDiagnostic(diag))
	}
	replacements = purefn.Replacements(entries)
	return entries, diags, replacements, changed
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

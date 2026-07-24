package diagnostics

// Project-configuration codes (CFGxxx). Issued when the process cannot load
// the project tsconfig that was named (or discovered) for it — the config
// every lane derives its Programs from. Strict like tsc: these are never
// downgraded or swallowed; the daemon fails the op and CLI lanes exit.
const (
	// CodeTsconfigLoadFailed — the named/discovered tsconfig.json is missing
	// or failed to parse, so no Program can be built from it. The daemon
	// setSources op errors with this code tagged in the message; lint hosts
	// synthesize the catalog diagnostic from it. Args: [detail] e.g.
	// "tsconfig parse failed: <first tsgo diagnostic>". Fix the tsconfig (or
	// the configured path); the fallback defaults apply only when NO config
	// is named at all.
	CodeTsconfigLoadFailed = "CFG001"
)

func init() {
	register(Definition{
		Code: CodeTsconfigLoadFailed,
		// FamilyMarker: the scan subsystem owns it — the marker scan is what
		// could not run. Kept on an existing family so the wire enum and its
		// TS mirror stay untouched.
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Project tsconfig failed to load — every lane reads this config, so the operation stops",
	})
}

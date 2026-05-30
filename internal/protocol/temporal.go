package protocol

// temporal.go is the single source of truth for the builtin Temporal types.
// Every scanner / id / emitter site consults this table instead of
// hard-coding type-name switches, so adding or changing a Temporal type is a
// one-line edit here. Detection is namespace-qualified (the type's symbol
// parent must be the `Temporal` namespace) — see TemporalInfoForSymbol — so a
// user type literally named `PlainDate` never collides with the builtin.

// TemporalNamespace is the namespace symbol name a builtin Temporal type's
// declaration sits under.
const TemporalNamespace = "Temporal"

// TemporalInfo describes one builtin Temporal type.
type TemporalInfo struct {
	// Name is the bare type name (the symbol name), e.g. "PlainDate".
	Name string
	// SubKind is the reflection sub-kind stamped on the RunType.
	SubKind ReflectionSubKind
	// Builtin is the ClassRef.Builtin value — the qualified constructor path
	// the cache footer wires as `globalThis.<Builtin>`, e.g.
	// "Temporal.PlainDate".
	Builtin string
	// HasCompare reports whether the type ships a static `compare(a, b)`
	// (every Temporal type except PlainMonthDay). Drives whether min/max
	// bound support is possible for a future Temporal format family.
	HasCompare bool
	// IsDuration flags Temporal.Duration — a length, not a point in time:
	// no ordering against "now", no min/max bound semantics.
	IsDuration bool
}

// temporalTypes is the registry, keyed by bare type name. Order is the
// canonical declaration order used by tests + docs.
var temporalTypes = map[string]TemporalInfo{
	"Instant":        {Name: "Instant", SubKind: SubKindTemporalInstant, Builtin: "Temporal.Instant", HasCompare: true},
	"ZonedDateTime":  {Name: "ZonedDateTime", SubKind: SubKindTemporalZonedDateTime, Builtin: "Temporal.ZonedDateTime", HasCompare: true},
	"PlainDate":      {Name: "PlainDate", SubKind: SubKindTemporalPlainDate, Builtin: "Temporal.PlainDate", HasCompare: true},
	"PlainTime":      {Name: "PlainTime", SubKind: SubKindTemporalPlainTime, Builtin: "Temporal.PlainTime", HasCompare: true},
	"PlainDateTime":  {Name: "PlainDateTime", SubKind: SubKindTemporalPlainDateTime, Builtin: "Temporal.PlainDateTime", HasCompare: true},
	"PlainYearMonth": {Name: "PlainYearMonth", SubKind: SubKindTemporalPlainYearMonth, Builtin: "Temporal.PlainYearMonth", HasCompare: true},
	"PlainMonthDay":  {Name: "PlainMonthDay", SubKind: SubKindTemporalPlainMonthDay, Builtin: "Temporal.PlainMonthDay", HasCompare: false},
	"Duration":       {Name: "Duration", SubKind: SubKindTemporalDuration, Builtin: "Temporal.Duration", HasCompare: true, IsDuration: true},
}

// temporalBySubKind is the reverse lookup (SubKind → info), built once.
var temporalBySubKind = func() map[ReflectionSubKind]TemporalInfo {
	out := make(map[ReflectionSubKind]TemporalInfo, len(temporalTypes))
	for _, info := range temporalTypes {
		out[info.SubKind] = info
	}
	return out
}()

// TemporalInfoByName returns the registry entry for a bare Temporal type
// name (caller must have already confirmed the namespace), or ok=false.
func TemporalInfoByName(name string) (TemporalInfo, bool) {
	info, ok := temporalTypes[name]
	return info, ok
}

// TemporalInfoBySubKind returns the registry entry for a SubKind, or
// ok=false when the SubKind isn't a Temporal type.
func TemporalInfoBySubKind(subKind ReflectionSubKind) (TemporalInfo, bool) {
	info, ok := temporalBySubKind[subKind]
	return info, ok
}

// IsTemporalSubKind reports whether subKind is one of the Temporal types.
func IsTemporalSubKind(subKind ReflectionSubKind) bool {
	_, ok := temporalBySubKind[subKind]
	return ok
}

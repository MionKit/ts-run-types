package resolver_test

import (
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/resolver"
)

// runtypesDTS mirrors internal/testfixtures/runtypes.d.ts — the fake
// `@mionjs/ts-go-run-types` module declaration. setupInline always
// overlays it under the test cwd so caller snippets stay terse, the
// same trick the FE helper uses (packages/vite-plugin-runtypes/test/helpers/inline.ts:30).
const runtypesDTS = `declare module '@mionjs/ts-go-run-types' {
  export type InjectRunTypeId<T> = string & {readonly __mionInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function reflectRunTypeId<T>(value: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
}
`

// temporalDTS is a minimal ambient `Temporal` namespace so snippets can
// reference Temporal.PlainDate etc. Mirrors the SHAPE of
// internal/testfixtures/temporal.d.ts (interface X + const X: XConstructor).
// Always overlaid by setupInline under the test cwd, like runtypesDTS.
const temporalDTS = `declare namespace Temporal {
  interface Instant { readonly epochMilliseconds: number; readonly epochNanoseconds: bigint; toJSON(): string; equals(o: Instant): boolean; }
  interface InstantConstructor { from(item: Instant | string): Instant; fromEpochMilliseconds(ms: number): Instant; compare(a: Instant, b: Instant): number; prototype: Instant; }
  const Instant: InstantConstructor;
  interface ZonedDateTime { readonly epochNanoseconds: bigint; readonly timeZoneId: string; toJSON(): string; equals(o: ZonedDateTime | string): boolean; }
  interface ZonedDateTimeConstructor { from(item: ZonedDateTime | string): ZonedDateTime; compare(a: ZonedDateTime, b: ZonedDateTime): number; prototype: ZonedDateTime; }
  const ZonedDateTime: ZonedDateTimeConstructor;
  interface PlainDate { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; equals(o: PlainDate | string): boolean; }
  interface PlainDateConstructor { from(item: PlainDate | string): PlainDate; compare(a: PlainDate, b: PlainDate): number; prototype: PlainDate; }
  const PlainDate: PlainDateConstructor;
  interface PlainTime { readonly hour: number; readonly minute: number; readonly second: number; toJSON(): string; equals(o: PlainTime | string): boolean; }
  interface PlainTimeConstructor { from(item: PlainTime | string): PlainTime; compare(a: PlainTime, b: PlainTime): number; prototype: PlainTime; }
  const PlainTime: PlainTimeConstructor;
  interface PlainDateTime { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; equals(o: PlainDateTime | string): boolean; }
  interface PlainDateTimeConstructor { from(item: PlainDateTime | string): PlainDateTime; compare(a: PlainDateTime, b: PlainDateTime): number; prototype: PlainDateTime; }
  const PlainDateTime: PlainDateTimeConstructor;
  interface PlainYearMonth { readonly year: number; readonly month: number; toJSON(): string; equals(o: PlainYearMonth | string): boolean; }
  interface PlainYearMonthConstructor { from(item: PlainYearMonth | string): PlainYearMonth; compare(a: PlainYearMonth, b: PlainYearMonth): number; prototype: PlainYearMonth; }
  const PlainYearMonth: PlainYearMonthConstructor;
  interface PlainMonthDay { readonly monthCode: string; readonly day: number; toJSON(): string; equals(o: PlainMonthDay | string): boolean; }
  interface PlainMonthDayConstructor { from(item: PlainMonthDay | string): PlainMonthDay; prototype: PlainMonthDay; }
  const PlainMonthDay: PlainMonthDayConstructor;
  interface Duration { readonly years: number; readonly seconds: number; toJSON(): string; }
  interface DurationConstructor { from(item: Duration | string): Duration; compare(a: Duration, b: Duration): number; prototype: Duration; }
  const Duration: DurationConstructor;
}
`

// setupInline builds a Resolver over an in-memory overlay of TypeScript
// sources. Mirrors withInlineSources in helpers/inline.ts so Go tests can
// keep their snippet right next to the assertions instead of jumping to a
// fixture file.
func setupInline(t *testing.T, sources map[string]string) *resolver.Resolver {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources)+1)
	fileNames := make([]string, 0, len(sources)+1)
	if _, ok := sources["runtypes.d.ts"]; !ok {
		abs := tspath.ResolvePath(cwd, "runtypes.d.ts")
		overlay[abs] = runtypesDTS
		fileNames = append(fileNames, abs)
	}
	if _, ok := sources["temporal.d.ts"]; !ok {
		abs := tspath.ResolvePath(cwd, "temporal.d.ts")
		overlay[abs] = temporalDTS
		fileNames = append(fileNames, abs)
	}
	for rel, code := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = code
		fileNames = append(fileNames, abs)
	}
	p, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	r, err := resolver.New(p, resolver.Options{Cwd: cwd, SingleThreaded: true})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(r.Close)
	return r
}

// resolveInline pins code to test.ts in an in-memory program, scans it,
// and returns the resolver plus the RunType entry for the first call site.
// Tests that need to dump the full type list after the scan use the
// returned resolver; tests that only check the root type ignore it.
func resolveInline(t *testing.T, code string) (*resolver.Resolver, *protocol.RunType) {
	t.Helper()
	r := setupInline(t, map[string]string{"test.ts": code})
	tn := resolveFile(t, r, "test.ts")
	return r, tn
}

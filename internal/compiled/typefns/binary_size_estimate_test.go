package typefns

import (
	"testing"

	// Side-effect: registers the numeric/string/datetime format emitters so
	// LookupForRunType resolves them (the binary BinarySizer hint path).
	_ "github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// generous estimates with no MaxBytes clamp interfering — Bias 1 takes the most
// generous anchor so the arithmetic is easy to pin.
func genConfig() SizeEstimateConfig {
	return SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 1 << 20}
}

func numberFmt(params map[string]any) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindNumber, FormatAnnotation: &protocol.FormatAnnotation{Name: "numberFormat", Params: params}}
}

func estimate(rt *protocol.RunType, cfg SizeEstimateConfig) int {
	return EstimateBinarySize(rt, map[string]*protocol.RunType{}, cfg)
}

func TestEstimate_Scalars(t *testing.T) {
	cfg := genConfig()
	cases := []struct {
		name string
		rt   *protocol.RunType
		want int
	}{
		{"bool", &protocol.RunType{Kind: protocol.KindBoolean}, 1},
		{"null", &protocol.RunType{Kind: protocol.KindNull}, 1},
		{"number float64", &protocol.RunType{Kind: protocol.KindNumber}, 8},
		{"date", &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindDate}, 8},
		{"literal", &protocol.RunType{Kind: protocol.KindLiteral}, 1}, // 0 bytes, floored to 1
	}
	for _, tc := range cases {
		if got := estimate(tc.rt, cfg); got != tc.want {
			t.Errorf("%s: estimate = %d, want %d", tc.name, got, tc.want)
		}
	}
}

// A packed numeric format must reduce the estimate to the SAME width
// EmitToBinary writes — the single source of truth the BinarySizer enforces.
func TestEstimate_NumberFormatPacking(t *testing.T) {
	cfg := genConfig()
	cases := []struct {
		name string
		rt   *protocol.RunType
		want int
	}{
		{"uint8", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0}), 1},
		{"uint16", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 65535.0}), 2},
		{"int16", numberFmt(map[string]any{"integer": true, "min": -1000.0, "max": 1000.0}), 2},
		{"int32", numberFmt(map[string]any{"integer": true, "min": -100000.0, "max": 100000.0}), 4},
		{"wide -> float64", numberFmt(map[string]any{"integer": true, "min": -1e15, "max": 1e15}), 8},
		{"float -> float64", numberFmt(map[string]any{"float": true}), 8},
	}
	for _, tc := range cases {
		if got := estimate(tc.rt, cfg); got != tc.want {
			t.Errorf("%s: estimate = %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestEstimate_String(t *testing.T) {
	cfg := genConfig()
	// no format: varint(32) + 32 = 1 + 32 = 33
	if got := estimate(&protocol.RunType{Kind: protocol.KindString}, cfg); got != 33 {
		t.Errorf("unbounded string: estimate = %d, want 33", got)
	}
	// maxLength 10: bias 1 takes the max -> varint(10)+10 = 11
	bounded := &protocol.RunType{Kind: protocol.KindString, FormatAnnotation: &protocol.FormatAnnotation{
		Name: "stringFormat", Params: map[string]any{"maxLength": 10.0}}}
	if got := estimate(bounded, cfg); got != 11 {
		t.Errorf("maxLength string: estimate = %d, want 11", got)
	}
}

func TestEstimate_ObjectRequiredOptionalBitmap(t *testing.T) {
	cfg := genConfig()
	prop := func(name string, optional bool, child *protocol.RunType) *protocol.RunType {
		return &protocol.RunType{Kind: protocol.KindProperty, Name: name, Optional: optional, Child: child}
	}
	num := &protocol.RunType{Kind: protocol.KindNumber}
	// two required numbers: 8 + 8, no bitmap
	obj := &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("a", false, num), prop("b", false, num)}}
	if got := estimate(obj, cfg); got != 16 {
		t.Errorf("two required: estimate = %d, want 16", got)
	}
	// one required + one optional: 8 + (8*bias1) + ceil(1/8)=1 bitmap = 17
	objOpt := &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		prop("a", false, num), prop("b", true, num)}}
	if got := estimate(objOpt, cfg); got != 17 {
		t.Errorf("one required one optional: estimate = %d, want 17", got)
	}
}

func TestEstimate_ArrayAndItemsAndCap(t *testing.T) {
	num := &protocol.RunType{Kind: protocol.KindNumber}
	arr := &protocol.RunType{Kind: protocol.KindArray, Child: num}
	// items 100, element 8: varint(100)=1 + 100*8 = 801
	if got := estimate(arr, SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 1 << 20}); got != 801 {
		t.Errorf("array of 100 numbers: estimate = %d, want 801", got)
	}
	// MaxBytes clamp brings the same array down to the cap
	if got := estimate(arr, SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 64}); got != 64 {
		t.Errorf("array clamp: estimate = %d, want 64", got)
	}
}

// A self-referential type must terminate (cycle break) and stay bounded.
func TestEstimate_CycleTerminates(t *testing.T) {
	node := &protocol.RunType{ID: "n1", Kind: protocol.KindObjectLiteral}
	selfRef := &protocol.RunType{Kind: protocol.KindRef, ID: "n1"}
	child := &protocol.RunType{Kind: protocol.KindProperty, Name: "self", Child: selfRef}
	node.Children = []*protocol.RunType{child}
	refTable := map[string]*protocol.RunType{"n1": node}
	got := EstimateBinarySize(node, refTable, genConfig())
	if got < 1 || got > genConfig().MaxBytes {
		t.Errorf("cyclic type: estimate = %d, want in [1, MaxBytes]", got)
	}
}

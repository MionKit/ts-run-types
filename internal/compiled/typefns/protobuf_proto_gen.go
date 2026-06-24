package typefns

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// protobuf_proto_gen.go — deterministic proto3 schema generation for an
// in-subset message. Field numbers come from ProtobufFields and per-field forms
// from ClassifyProtoField, so the generated .proto and the wire emitter share
// one source of truth (the numbers cannot drift). v1 forms: scalar (incl.
// bytes), nested message, repeated, map; oneof / enum / well-known are deferred
// (the subset predicate rejects them, so they never reach here).

type protoGen struct {
	refTable   map[string]*protocol.RunType
	nameByNode map[*protocol.RunType]string
	usedNames  map[string]bool
	queue      []*protocol.RunType
}

// GenerateProto renders a proto3 schema for root, which must be an in-subset
// message. Deterministic: messages in breadth-first discovery order, fields in
// field-number (declaration) order.
func GenerateProto(root *protocol.RunType, refTable map[string]*protocol.RunType) (string, error) {
	rootClass, ok := ClassifyProtoField(root, refTable)
	if !ok || rootClass.Form != ProtoFormMessage {
		return "", fmt.Errorf("protobuf: root type is not a message")
	}
	gen := &protoGen{
		refTable:   refTable,
		nameByNode: map[*protocol.RunType]string{},
		usedNames:  map[string]bool{},
	}
	gen.nameFor(rootClass.Value)
	var blocks []string
	for len(gen.queue) > 0 {
		message := gen.queue[0]
		gen.queue = gen.queue[1:]
		block, err := gen.renderMessage(message)
		if err != nil {
			return "", err
		}
		blocks = append(blocks, block)
	}
	return "syntax = \"proto3\";\n\n" + strings.Join(blocks, "\n"), nil
}

// nameFor returns the .proto message name for rt, assigning one (and enqueuing
// rt for rendering) on first encounter. Structurally-identical messages resolve
// to one canonical node via the ref table, so pointer identity dedups them.
func (gen *protoGen) nameFor(rt *protocol.RunType) string {
	if name, ok := gen.nameByNode[rt]; ok {
		return name
	}
	base := sanitizeProtoIdent(rt.TypeName)
	if base == "" {
		base = "Message"
	}
	name := base
	for i := 1; gen.usedNames[name]; i++ {
		name = base + strconv.Itoa(i)
	}
	gen.usedNames[name] = true
	gen.nameByNode[rt] = name
	gen.queue = append(gen.queue, rt)
	return name
}

func (gen *protoGen) renderMessage(rt *protocol.RunType) (string, error) {
	var b strings.Builder
	b.WriteString("message " + gen.nameFor(rt) + " {\n")
	for _, slot := range ProtobufFields(rt, gen.refTable) {
		line, err := gen.fieldLine(slot)
		if err != nil {
			return "", err
		}
		b.WriteString("  " + line + "\n")
	}
	b.WriteString("}\n")
	return b.String(), nil
}

func (gen *protoGen) fieldLine(slot ProtoFieldSlot) (string, error) {
	class, ok := ClassifyProtoField(slot.Value, gen.refTable)
	if !ok {
		return "", fmt.Errorf("protobuf: field %q is not protobuf-expressible", slot.Name)
	}
	label, typeStr := "", ""
	switch class.Form {
	case ProtoFormRepeated:
		element, ok := ClassifyProtoField(class.Value, gen.refTable)
		if !ok {
			return "", fmt.Errorf("protobuf: element of %q is not protobuf-expressible", slot.Name)
		}
		label = "repeated "
		typeStr = gen.scalarOrMessage(element)
	case ProtoFormMap:
		value, ok := ClassifyProtoField(class.Value, gen.refTable)
		if !ok {
			return "", fmt.Errorf("protobuf: value of %q is not protobuf-expressible", slot.Name)
		}
		typeStr = "map<" + string(class.MapKey) + ", " + gen.scalarOrMessage(value) + ">"
	default:
		if slot.Optional {
			label = "optional "
		}
		typeStr = gen.scalarOrMessage(class)
	}
	return label + typeStr + " " + sanitizeProtoIdent(slot.Name) + " = " + strconv.Itoa(slot.Number) + ";", nil
}

// scalarOrMessage returns the .proto type name for a scalar or message class —
// the only forms valid as a repeated element / map value / singular field in v1
// (the predicate gates the rest out before generation).
func (gen *protoGen) scalarOrMessage(class ProtoFieldClass) string {
	if class.Form == ProtoFormMessage {
		return gen.nameFor(class.Value)
	}
	return string(class.Scalar)
}

// sanitizeProtoIdent returns name unchanged when it is already a valid protobuf
// identifier, otherwise replaces each invalid character with an underscore (a
// leading digit is also replaced, since identifiers cannot start with one).
// Empty in → empty out (the caller substitutes a synthesized base name).
func sanitizeProtoIdent(name string) string {
	if name == "" {
		return ""
	}
	var b strings.Builder
	for i, r := range name {
		switch {
		case r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z'):
			b.WriteRune(r)
		case i > 0 && r >= '0' && r <= '9':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
}

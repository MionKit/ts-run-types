package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// TestParseMirror_FatalOnSyntaxError verifies that reconciling a mirror file the
// parser rejects (a syntax error → non-empty Diagnostics) is FATAL — we never
// silently append to or overwrite an unparseable file. parseMirror calls
// fatal() (os.Exit), so the assertion runs in a re-exec'd subprocess.
func TestParseMirror_FatalOnSyntaxError(t *testing.T) {
	if os.Getenv("RT_PARSEFAIL_CHILD") == "1" {
		// Child process: parse a deliberately broken mirror — should os.Exit(1).
		parseMirror("/broken.ts", []byte("export const x: = {{{ ;\n"))
		return // unreachable if fatal fired
	}

	cmd := exec.Command(os.Args[0], "-test.run=TestParseMirror_FatalOnSyntaxError")
	cmd.Env = append(os.Environ(), "RT_PARSEFAIL_CHILD=1")
	output, err := cmd.CombinedOutput()

	exitErr, ok := err.(*exec.ExitError)
	if !ok {
		t.Fatalf("expected the child to exit non-zero (fatal), got err=%v\noutput:\n%s", err, output)
	}
	if exitErr.ExitCode() == 0 {
		t.Fatalf("expected non-zero exit on parse failure; output:\n%s", output)
	}
	if !strings.Contains(string(output), "cannot parse mirror") {
		t.Errorf("expected a 'cannot parse mirror' fatal message; got:\n%s", output)
	}
}

// TestUpdate_FatalOnUnparseableFile drives the same fatal through the full
// gen --update CLI path on a real broken mirror file, confirming the binary
// refuses to touch it.
func TestUpdate_FatalOnUnparseableFile(t *testing.T) {
	if os.Getenv("RT_UPDATEFAIL_CHILD") == "1" {
		broken := []byte("import type { User } from './u';\nexport const friendlyUser: FriendlyType<User> = {{{ ;\n")
		updateMirrorFile(mirrorWrite{
			mirrorPath:   os.Getenv("RT_UPDATEFAIL_PATH"),
			wantFriendly: true,
		})
		_ = broken
		return
	}

	dir := t.TempDir()
	mirrorPath := filepath.Join(dir, "mirror.ts")
	if err := os.WriteFile(mirrorPath, []byte("export const friendlyUser: FriendlyType<User> = {{{ ;\n"), 0o644); err != nil {
		t.Fatalf("seed broken mirror: %v", err)
	}

	cmd := exec.Command(os.Args[0], "-test.run=TestUpdate_FatalOnUnparseableFile")
	cmd.Env = append(os.Environ(), "RT_UPDATEFAIL_CHILD=1", "RT_UPDATEFAIL_PATH="+mirrorPath)
	output, err := cmd.CombinedOutput()
	if exitErr, ok := err.(*exec.ExitError); !ok || exitErr.ExitCode() == 0 {
		t.Fatalf("expected fatal non-zero exit; err=%v output:\n%s", err, output)
	}
	if !strings.Contains(string(output), "cannot parse mirror") {
		t.Errorf("expected 'cannot parse mirror'; got:\n%s", output)
	}
	// The broken file must be left untouched.
	after, _ := os.ReadFile(mirrorPath)
	if !strings.Contains(string(after), "{{{") {
		t.Errorf("the unparseable mirror was modified; got:\n%s", after)
	}
}

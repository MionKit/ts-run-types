package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich/mirror"
)

// TestUpdate_FatalOnUnparseableFile drives the parse-failure fatal through the
// full gen --update CLI path on a real broken mirror file, confirming the binary
// refuses to touch it. updateMirrorFile (the CLI shim) calls fatal() (os.Exit)
// when mirror.Reconcile returns a parse error, so the assertion runs in a
// re-exec'd subprocess.
func TestUpdate_FatalOnUnparseableFile(t *testing.T) {
	if os.Getenv("RT_UPDATEFAIL_CHILD") == "1" {
		updateMirrorFile(mirror.Spec{
			MirrorPath:   os.Getenv("RT_UPDATEFAIL_PATH"),
			WantFriendly: true,
		})
		return // unreachable if fatal fired
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

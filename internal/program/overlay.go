package program

import (
	"time"

	"github.com/microsoft/typescript-go/shim/tspath"
	vfspkg "github.com/microsoft/typescript-go/shim/vfs"
)

// overlayFS layers an in-memory set of virtual files on top of a real VFS.
// Writes are not propagated; reads of virtual paths return the overlay text.
// Mirrors the pattern used in tsgolint's internal/utils/overlay_vfs.go.
type overlayFS struct {
	base          vfspkg.FS
	files         map[string]string
	caseSensitive bool
}

func newOverlayFS(base vfspkg.FS, files map[string]string) vfspkg.FS {
	normalized := make(map[string]string, len(files))
	for path, content := range files {
		normalized[tspath.NormalizePath(path)] = content
	}
	return &overlayFS{base: base, files: normalized, caseSensitive: base.UseCaseSensitiveFileNames()}
}

func (overlay *overlayFS) UseCaseSensitiveFileNames() bool { return overlay.caseSensitive }

func (overlay *overlayFS) FileExists(path string) bool {
	if _, ok := overlay.files[tspath.NormalizePath(path)]; ok {
		return true
	}
	return overlay.base.FileExists(path)
}

func (overlay *overlayFS) ReadFile(path string) (string, bool) {
	if content, ok := overlay.files[tspath.NormalizePath(path)]; ok {
		return content, true
	}
	return overlay.base.ReadFile(path)
}

func (overlay *overlayFS) WriteFile(path string, data string) error {
	return overlay.base.WriteFile(path, data)
}

func (overlay *overlayFS) Remove(path string) error {
	return overlay.base.Remove(path)
}

func (overlay *overlayFS) DirectoryExists(path string) bool {
	return overlay.base.DirectoryExists(path)
}

func (overlay *overlayFS) GetAccessibleEntries(path string) vfspkg.Entries {
	return overlay.base.GetAccessibleEntries(path)
}

func (overlay *overlayFS) Stat(path string) vfspkg.FileInfo {
	return overlay.base.Stat(path)
}

func (overlay *overlayFS) WalkDir(root string, walkFn vfspkg.WalkDirFunc) error {
	return overlay.base.WalkDir(root, walkFn)
}

func (overlay *overlayFS) Realpath(path string) string {
	return overlay.base.Realpath(path)
}

func (overlay *overlayFS) Chtimes(path string, accessTime time.Time, modTime time.Time) error {
	return overlay.base.Chtimes(path, accessTime, modTime)
}

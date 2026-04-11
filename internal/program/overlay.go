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
	base     vfspkg.FS
	files    map[string]string
	useCaseS bool
}

func newOverlayFS(base vfspkg.FS, files map[string]string) vfspkg.FS {
	norm := make(map[string]string, len(files))
	for k, v := range files {
		norm[tspath.NormalizePath(k)] = v
	}
	return &overlayFS{base: base, files: norm, useCaseS: base.UseCaseSensitiveFileNames()}
}

func (o *overlayFS) UseCaseSensitiveFileNames() bool { return o.useCaseS }

func (o *overlayFS) FileExists(path string) bool {
	if _, ok := o.files[tspath.NormalizePath(path)]; ok {
		return true
	}
	return o.base.FileExists(path)
}

func (o *overlayFS) ReadFile(path string) (string, bool) {
	if v, ok := o.files[tspath.NormalizePath(path)]; ok {
		return v, true
	}
	return o.base.ReadFile(path)
}

func (o *overlayFS) WriteFile(path string, data string) error {
	return o.base.WriteFile(path, data)
}

func (o *overlayFS) Remove(path string) error {
	return o.base.Remove(path)
}

func (o *overlayFS) DirectoryExists(path string) bool {
	return o.base.DirectoryExists(path)
}

func (o *overlayFS) GetAccessibleEntries(path string) vfspkg.Entries {
	return o.base.GetAccessibleEntries(path)
}

func (o *overlayFS) Stat(path string) vfspkg.FileInfo {
	return o.base.Stat(path)
}

func (o *overlayFS) WalkDir(root string, walkFn vfspkg.WalkDirFunc) error {
	return o.base.WalkDir(root, walkFn)
}

func (o *overlayFS) Realpath(path string) string {
	return o.base.Realpath(path)
}

func (o *overlayFS) Chtimes(path string, aTime time.Time, mTime time.Time) error {
	return o.base.Chtimes(path, aTime, mTime)
}

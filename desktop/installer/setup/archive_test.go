package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

func buildZip(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for name, body := range files {
		f, err := w.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestSafePathRefusesEscapes(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"", "../evil.txt", "a/../../evil.txt", "..\\evil.txt", "/etc/passwd", "\\\\server\\share\\x", "C:/Windows/x", "C:evil", "a/b:stream", "."} {
		if got, err := safePath(root, name); err == nil {
			t.Errorf("safePath(%q) = %q, want an error", name, got)
		}
	}
}

func TestSafePathAcceptsNormalEntries(t *testing.T) {
	root := t.TempDir()
	for _, name := range []string{"REcleaner.exe", "resources/app/main.cjs", "resources/app/ui/assets/index-abc.js"} {
		got, err := safePath(root, name)
		if err != nil {
			t.Errorf("safePath(%q) error: %v", name, err)
			continue
		}
		if filepath.Dir(got) == "" || !filepath.IsAbs(got) {
			t.Errorf("safePath(%q) = %q, want an absolute path inside the root", name, got)
		}
	}
}

func TestExtractWritesFilesInsideDestination(t *testing.T) {
	dest := filepath.Join(t.TempDir(), "Programs", "REcleaner")
	data := buildZip(t, map[string]string{"REcleaner.exe": "MZ", "resources/app/main.cjs": "main"})
	if err := extract(data, dest); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(filepath.Join(dest, "resources", "app", "main.cjs"))
	if err != nil || string(got) != "main" {
		t.Fatalf("extracted file = %q, %v", got, err)
	}
}

func TestExtractRejectsTraversalAndWritesNothingOutside(t *testing.T) {
	parent := t.TempDir()
	dest := filepath.Join(parent, "install")
	data := buildZip(t, map[string]string{"../evil.txt": "pwned"})
	if err := extract(data, dest); err == nil {
		t.Fatal("extract accepted a ../ entry")
	}
	if _, err := os.Stat(filepath.Join(parent, "evil.txt")); err == nil {
		t.Fatal("a file was written outside the destination")
	}
}

func withTrailer(stub, archive []byte, offset uint64) []byte {
	trailer := make([]byte, 8)
	binary.LittleEndian.PutUint64(trailer, offset)
	return append(append(append([]byte{}, stub...), archive...), trailer...)
}

func TestPayloadReadsTheAppendedArchive(t *testing.T) {
	stub := bytes.Repeat([]byte("S"), 100)
	archive := buildZip(t, map[string]string{"REcleaner.exe": "MZ"})
	path := filepath.Join(t.TempDir(), "setup.exe")
	if err := os.WriteFile(path, withTrailer(stub, archive, uint64(len(stub))), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := payload(path)
	if err != nil || !bytes.Equal(got, archive) {
		t.Fatalf("payload() mismatch: err=%v len=%d want=%d", err, len(got), len(archive))
	}
}

func TestPayloadRejectsDamagedInstallers(t *testing.T) {
	dir := t.TempDir()
	cases := map[string][]byte{
		"tiny":        []byte("short"),
		"zero-offset": withTrailer([]byte("stub"), []byte("zip"), 0),
		"past-end":    withTrailer([]byte("stub"), []byte("zip"), 1<<40),
	}
	for name, body := range cases {
		path := filepath.Join(dir, name+".exe")
		if err := os.WriteFile(path, body, 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := payload(path); err == nil {
			t.Errorf("payload(%s) accepted a damaged installer", name)
		}
	}
}

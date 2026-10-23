package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func installed(t *testing.T) (localAppData, dir string) {
	t.Helper()
	localAppData = t.TempDir()
	dir = filepath.Join(localAppData, "Programs", "REcleaner")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "REcleaner.exe"), []byte("MZ"), 0o600); err != nil {
		t.Fatal(err)
	}
	return localAppData, dir
}

func TestInstalledFolderMayBeRemoved(t *testing.T) {
	localAppData, dir := installed(t)
	got, problem := installDirProblem(filepath.Join(dir, "Uninstall.exe"), localAppData)
	if problem != "" || got != dir {
		t.Fatalf("got (%q, %q), want (%q, \"\")", got, problem, dir)
	}
}

func TestPortableCopyIsNeverRemoved(t *testing.T) {
	localAppData, _ := installed(t)
	portable := t.TempDir()
	if err := os.WriteFile(filepath.Join(portable, "REcleaner.exe"), []byte("MZ"), 0o600); err != nil {
		t.Fatal(err)
	}
	if dir, problem := installDirProblem(filepath.Join(portable, "Uninstall.exe"), localAppData); problem != problemPortable || dir != "" {
		t.Fatalf("got (%q, %q)", dir, problem)
	}
}

func TestUnusualLocationsAreRefused(t *testing.T) {
	localAppData, dir := installed(t)
	cases := map[string]string{
		"parent of the install folder": filepath.Join(filepath.Dir(dir), "Uninstall.exe"),
		"inside the install folder":    filepath.Join(dir, "resources", "Uninstall.exe"),
		"Local AppData itself":         filepath.Join(localAppData, "Uninstall.exe"),
		"filesystem root":              filepath.Join(string(os.PathSeparator), "Uninstall.exe"),
	}
	for name, self := range cases {
		if got, problem := installDirProblem(self, localAppData); problem == "" {
			t.Errorf("%s: folder %q was accepted", name, got)
		}
	}
}

func TestMissingLocalAppDataIsRefused(t *testing.T) {
	_, dir := installed(t)
	if _, problem := installDirProblem(filepath.Join(dir, "Uninstall.exe"), ""); problem == "" {
		t.Fatal("an empty LOCALAPPDATA was accepted")
	}
}

func TestInstallFolderThatIsALinkIsRefused(t *testing.T) {
	localAppData := t.TempDir()
	elsewhere := t.TempDir()
	if err := os.WriteFile(filepath.Join(elsewhere, "REcleaner.exe"), []byte("MZ"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(localAppData, "Programs"), 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(localAppData, "Programs", "REcleaner")
	if err := os.Symlink(elsewhere, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if got, problem := installDirProblem(filepath.Join(link, "Uninstall.exe"), localAppData); problem == "" || !strings.Contains(problem, "link") {
		t.Fatalf("a linked install folder was accepted: (%q, %q)", got, problem)
	}
}

func TestFolderWithoutTheApplicationIsRefused(t *testing.T) {
	localAppData, dir := installed(t)
	if err := os.Remove(filepath.Join(dir, "REcleaner.exe")); err != nil {
		t.Fatal(err)
	}
	if _, problem := installDirProblem(filepath.Join(dir, "Uninstall.exe"), localAppData); problem == "" {
		t.Fatal("a folder without REcleaner.exe was accepted")
	}
}

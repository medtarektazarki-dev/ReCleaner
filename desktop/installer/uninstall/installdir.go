package main

import (
	"os"
	"path/filepath"
	"strings"
)

const problemPortable = "This is not the installed copy of REcleaner. For a portable copy, close REcleaner and delete the extracted folder manually. No folder was deleted."

// installDirProblem decides whether the folder holding this Uninstall.exe may be deleted. It returns
// the folder, or a message explaining why nothing will be removed. Only the per-user install folder
// (%LOCALAPPDATA%\Programs\REcleaner) qualifies: a portable copy, a drive root, or a folder that is
// really a link to somewhere else is refused.
func installDirProblem(self, localAppData string) (string, string) {
	if localAppData == "" {
		return "", "Uninstall stopped because the current user's Local AppData folder could not be identified. No files were deleted."
	}
	actualDir, err := filepath.Abs(filepath.Clean(filepath.Dir(self)))
	if err != nil {
		return "", "Uninstall stopped because the application folder could not be resolved. No files were deleted."
	}
	expectedDir, err := filepath.Abs(filepath.Join(localAppData, "Programs", "REcleaner"))
	if err != nil {
		return "", "Uninstall stopped because the expected installation folder could not be resolved. No files were deleted."
	}
	volumeRoot := filepath.Clean(filepath.VolumeName(actualDir) + string(os.PathSeparator))
	if !strings.EqualFold(actualDir, expectedDir) || strings.EqualFold(actualDir, volumeRoot) {
		return "", problemPortable
	}
	info, err := os.Lstat(actualDir)
	if err != nil || !info.IsDir() || info.Mode()&(os.ModeSymlink|os.ModeIrregular) != 0 {
		return "", "Uninstall stopped because the application folder is a link or could not be inspected. No files were deleted."
	}
	if _, err := os.Stat(filepath.Join(actualDir, "REcleaner.exe")); err != nil {
		return "", "Uninstall stopped. REcleaner.exe is not in the installed application folder. No files were deleted."
	}
	return actualDir, ""
}

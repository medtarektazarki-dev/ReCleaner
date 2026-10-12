package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

const (
	mbYesNo   = 0x00000004
	mbIconInf = 0x00000040
	mbIconErr = 0x00000010
	idYes     = 6
)

func message(title, text string, flags uintptr) int {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	t, _ := syscall.UTF16PtrFromString(title)
	b, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := proc.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), flags)
	return int(r)
}

func psQuote(value string) string {
  return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func main() {
	self, err := os.Executable()
	if err != nil {
		return
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		message("REcleaner", "Uninstall stopped because the current user's Local AppData folder could not be identified. No files were deleted.", mbIconErr)
		return
	}
	actualDir, err := filepath.Abs(filepath.Clean(filepath.Dir(self)))
	if err != nil {
		message("REcleaner", "Uninstall stopped because the application folder could not be resolved. No files were deleted.", mbIconErr)
		return
	}
	expectedDir, err := filepath.Abs(filepath.Join(localAppData, "Programs", "REcleaner"))
	if err != nil {
		message("REcleaner", "Uninstall stopped because the expected installation folder could not be resolved. No files were deleted.", mbIconErr)
		return
	}
	volumeRoot := filepath.Clean(filepath.VolumeName(actualDir) + string(os.PathSeparator))
	if !strings.EqualFold(actualDir, expectedDir) || strings.EqualFold(actualDir, volumeRoot) {
		message("REcleaner", "This is not the installed copy of REcleaner. For a portable copy, close REcleaner and delete the extracted folder manually. No folder was deleted.", mbIconInf)
		return
	}
	dir := actualDir
	if _, err := os.Stat(filepath.Join(dir, "REcleaner.exe")); err != nil {
		message("REcleaner", "Uninstall stopped. REcleaner.exe is not in the installed application folder. No files were deleted.", mbIconErr)
		return
	}
	if message("REcleaner", "Remove REcleaner from this PC?\n\nYour Windows system files are not removed.", mbYesNo|mbIconInf) != idYes {
		return
	}
	script := `
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'REcleaner' -ErrorAction SilentlyContinue
Remove-Item -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\REcleaner' -Recurse -Force -ErrorAction SilentlyContinue
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'REcleaner.lnk'
$start = Join-Path ([Environment]::GetFolderPath('Programs')) 'REcleaner.lnk'
Remove-Item -LiteralPath $desktop, $start -Force -ErrorAction SilentlyContinue
`
	cmd := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Run(); err != nil {
		message("REcleaner", "Could not finish removing shortcuts and startup entries. The application files were kept.\n\n"+err.Error(), mbIconErr)
		return
	}
	removeScript := "Start-Sleep -Seconds 2; Remove-Item -LiteralPath " + psQuote(dir) + " -Recurse -Force -ErrorAction SilentlyContinue"
	remove := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-Command", removeScript)
	remove.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := remove.Start(); err != nil {
		message("REcleaner", "REcleaner registry entries were removed, but its program folder could not be scheduled for deletion. You can remove this folder manually:\n\n"+dir, mbIconErr)
		return
	}
}

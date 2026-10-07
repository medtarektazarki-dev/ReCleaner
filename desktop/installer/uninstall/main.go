package main

import (
	"os"
	"os/exec"
	"path/filepath"
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

func main() {
	self, err := os.Executable()
	if err != nil {
		return
	}
	dir := filepath.Clean(filepath.Dir(self))
	if _, err := os.Stat(filepath.Join(dir, "REcleaner.exe")); err != nil {
		message("REcleaner", "Uninstall stopped. REcleaner.exe is not in this folder.", mbIconErr)
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
	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = cmd.Run()
	remove := exec.Command("cmd.exe", "/c", "timeout /t 2 /nobreak >nul & rmdir /s /q \""+dir+"\"")
	remove.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	_ = remove.Start()
}

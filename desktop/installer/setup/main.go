//go:build windows

package main

import (
	"fmt"
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

// version is stamped at build time from package.json (-X main.version=...).
var version = "dev"

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

func shortcuts(dir, exe, uninstall string) error {
	script := fmt.Sprintf(`
$shell = New-Object -ComObject WScript.Shell
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'REcleaner.lnk'
$start = Join-Path ([Environment]::GetFolderPath('Programs')) 'REcleaner.lnk'
foreach ($path in @($desktop, $start)) {
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = %s
  $lnk.WorkingDirectory = %s
  $lnk.IconLocation = %s
  $lnk.Description = 'REcleaner — Windows Repair & Optimization'
  $lnk.WindowStyle = 1
  $lnk.Save()
}
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\REcleaner'
New-Item -Path $reg -Force | Out-Null
New-ItemProperty -Path $reg -Name DisplayName -Value 'REcleaner' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name DisplayVersion -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name Publisher -Value 'REcleaner' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name InstallLocation -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name DisplayIcon -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name UninstallString -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $reg -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
`, psQuote(exe), psQuote(dir), psQuote(exe+",0"), psQuote(version), psQuote(dir), psQuote(exe), psQuote(`"`+uninstall+`"`))
	cmd := exec.Command("powershell.exe", "-NoProfile", "-Command", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%w: %s", err, out)
	}
	return nil
}

func main() {
	if message("REcleaner Setup", "Install REcleaner?\n\nWindows repair and optimization.\n\nIt is installed for this user, with Desktop and Start menu shortcuts.", mbYesNo|mbIconInf) != idYes {
		return
	}
	self, err := os.Executable()
	if err != nil {
		message("REcleaner Setup", err.Error(), mbIconErr)
		return
	}
	data, err := payload(self)
	if err != nil {
		message("REcleaner Setup", err.Error(), mbIconErr)
		return
	}
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		base = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	dir := filepath.Join(base, "Programs", "REcleaner")
	if err := extract(data, dir); err != nil {
		message("REcleaner Setup", "Installation did not finish.\n\nClose REcleaner if it is open, then run setup again.\n\n"+err.Error(), mbIconErr)
		return
	}
	exe := filepath.Join(dir, "REcleaner.exe")
	uninstall := filepath.Join(dir, "Uninstall.exe")
	if _, err := os.Stat(exe); err != nil {
		message("REcleaner Setup", "REcleaner.exe was not unpacked.", mbIconErr)
		return
	}
	if err := shortcuts(dir, exe, uninstall); err != nil {
		message("REcleaner Setup", "REcleaner was copied, but a shortcut could not be created.\n\n"+err.Error(), mbIconErr)
		return
	}
	if message("REcleaner Setup", "REcleaner is installed.\n\nOpen it now?", mbYesNo|mbIconInf) == idYes {
		cmd := exec.Command(exe)
		cmd.Dir = dir
		_ = cmd.Start()
	}
}

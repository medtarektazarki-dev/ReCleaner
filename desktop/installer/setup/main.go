package main

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
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

func payload(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() < 16 {
		return nil, fmt.Errorf("installer is incomplete")
	}
	if _, err := f.Seek(-8, io.SeekEnd); err != nil {
		return nil, err
	}
	var off uint64
	if err := binary.Read(f, binary.LittleEndian, &off); err != nil {
		return nil, err
	}
	end := info.Size() - 8
	if off == 0 || int64(off) >= end {
		return nil, fmt.Errorf("installer payload is missing")
	}
	if _, err := f.Seek(int64(off), io.SeekStart); err != nil {
		return nil, err
	}
	return io.ReadAll(io.LimitReader(f, end-int64(off)))
}

func safePath(root, name string) (string, error) {
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, ":") || strings.HasPrefix(name, "/") || strings.HasPrefix(name, "\\") {
		return "", fmt.Errorf("refusing %s", name)
	}
	return filepath.Join(root, filepath.FromSlash(name)), nil
}

func extract(data []byte, dest string) error {
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	for _, file := range reader.File {
		target, err := safePath(dest, file.Name)
		if err != nil {
			return err
		}
		if file.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		in, err := file.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
		if err != nil {
			in.Close()
			return err
		}
		_, copyErr := io.Copy(out, in)
		in.Close()
		closeErr := out.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	return nil
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
New-ItemProperty -Path $reg -Name DisplayVersion -Value '1.0.0' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name Publisher -Value 'REcleaner' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name InstallLocation -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name DisplayIcon -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name UninstallString -Value %s -PropertyType String -Force | Out-Null
New-ItemProperty -Path $reg -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $reg -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
`, psQuote(exe), psQuote(dir), psQuote(exe+",0"), psQuote(dir), psQuote(exe), psQuote(`"`+uninstall+`"`))
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

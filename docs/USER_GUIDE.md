# REcleaner User Guide

## 1. What REcleaner does

REcleaner groups Windows diagnostics and maintenance actions in one desktop window. **Full System Scan is diagnostic**: it gathers system information and produces recommendations; it does not repair the PC by itself. Repairs and configuration changes are separate operations.

A health score summarizes selected checks. It is not a guarantee that Windows is healthy or malware-free. Some checks may be unavailable because of permissions, Windows edition, system state, or environment.

## 2. Download the build

Open [REcleaner Releases](https://github.com/medtarektazarki-dev/ReCleaner/releases) and choose the newest **REcleaner Windows build** prerelease. Download these files from the same release:

- **REcleaner.Setup.exe** — installer for the current Windows user.
- **REcleaner-win64.zip** — portable application folder. Keep all files together.
- **SHA256SUMS.txt** — SHA-256 checksums for the installer, ZIP, and icon.
- **REcleaner.ico** — optional application icon.

The successful Windows workflow also uploads an Actions artifact named **REcleaner-Windows-x64**. That is a temporary backup download and expires after 30 days; the Release page is the main download location. Use only files attached to the source revision you intended to download.

### Verify file hashes

In PowerShell, open the folder containing the downloaded files and run:

~~~powershell
Get-FileHash ".\REcleaner.Setup.exe" -Algorithm SHA256
Get-FileHash ".\REcleaner-win64.zip" -Algorithm SHA256
Get-FileHash ".\REcleaner.ico" -Algorithm SHA256
~~~

To verify the three files against the manifest automatically:

~~~powershell
$expected = @{}
Get-Content -LiteralPath .\SHA256SUMS.txt | ForEach-Object {
  if ($_ -notmatch '^([0-9a-fA-F]{64})\s+(.+)$') {
    throw "Invalid checksum line: $_"
  }
  $expected[$Matches[2].Trim()] = $Matches[1].ToUpperInvariant()
}

if ($expected.Count -ne 3) {
  throw "Expected checksums for the installer, ZIP, and icon."
}

foreach ($file in $expected.Keys) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing file: $file"
  }
  $actual = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
  if ($actual -ne $expected[$file]) {
    throw "SHA-256 mismatch: $file"
  }
}
Write-Output "All artifact hashes match."
~~~

A matching checksum detects a file mismatch or accidental corruption. It does **not** prove the publisher's identity because the checksum is distributed alongside the files.

## 3. Install or use the portable build

### Recommended: installer

1. Run **REcleaner.Setup.exe** from the downloaded folder.
2. Read the Windows prompt and the installation confirmation before accepting.
3. The installer is designed to install for the current user under **%LOCALAPPDATA%\\Programs\\REcleaner**.
4. It creates Desktop and Start menu shortcuts. Launch REcleaner from one of those shortcuts.

### Portable ZIP

1. Extract **REcleaner-win64.zip** completely into a folder you control.
2. Run **REcleaner.exe** from the extracted folder.
3. Keep the other files next to it. Do not move or copy only the EXE.

## 4. Windows security warnings

The current workflow does not Authenticode-sign the executable. Windows may show an unknown-publisher or reputation warning for an unsigned or unrecognized application. That warning is not proof of malware, but it is not something to bypass blindly either.

- Do not disable Microsoft Defender, SmartScreen, the firewall, or other protections to run REcleaner.
- If the file comes from an unknown source, a checksum does not match, or security software flags it, do not run it. Stop and investigate.
- Do not run the app as administrator just to open it. Elevation should only be used when the selected operation requires it.

## 5. Safe first run

1. Open REcleaner without elevation.
2. Start with **Full System Scan** and read its findings.
3. Review each suggested action before accepting it.
4. Keep important personal files backed up before running repairs or cleanup.
5. Keep a laptop connected to power during long repairs.
6. Read the final status and activity details. A failed, unavailable, cancelled, or timed-out operation must not be treated as success.

A restore point may be offered before a recommended repair, but it may be unavailable and does not replace a real backup. Windows repair commands can take time; do not power off the PC while DISM or System File Checker is working.

## 6. Understand the main areas

- **Overview / Full System Scan:** diagnostic readings and recommendations.
- **Optimize / Repair:** selected repair and cleanup operations; review the impact before confirming.
- **Disk:** disk checks and maintenance. Disk operations can take time and should not be interrupted casually.
- **Security:** selected Defender, firewall, hosts-file, and related controls. Security changes can reduce protection if used incorrectly.
- **Drivers:** inventory and driver-related operations. A driver update check is not the same as installing a driver.
- **Apps:** WinGet-based package operations. Review package identifiers and prompts before installing or updating software.
- **Users / Tweaks / Licensing:** account, configuration, or licensing operations that can affect the system. Use only when you understand the target and have authorization.

Exact availability depends on the current build and Windows environment. Unsupported operations should return an unavailable result instead of making a change.

## 7. Administrator access

Keep the application at standard user level for reading and low-risk checks. When an operation requires elevation, REcleaner checks the current Windows security token and should explain the requirement before offering to restart with Windows approval. Review the operation before approving the elevation prompt.

If you decline the Windows prompt, the operation should stop. Do not use elevation to work around an error or an operation marked unavailable.

## 8. Uninstall

Use Windows **Installed apps** if REcleaner is listed, or run **Uninstall.exe** from the installation folder. The bundled uninstaller is intended to remove REcleaner files and shortcuts, not Windows system files. If you used the portable ZIP, close the app and delete the extracted folder yourself.

## 9. Troubleshooting

- **Release or artifact is missing:** confirm you opened the correct successful Windows build run or Release page and that a temporary Actions artifact has not expired.
- **The app does not launch:** re-extract the full portable ZIP or rerun the installer from a fresh download. Do not move only the EXE.
- **A repair reports Administrator access required:** retry only if you intended to run that specific operation and understand its impact.
- **An operation is unavailable:** note the status and Windows version; do not treat absence of a result as a pass.
- **Security software blocks the file:** do not disable protection. Verify the source and hashes, then report the finding privately if it appears to be a false positive.

For a suspected security vulnerability, follow [SECURITY.md](../SECURITY.md). Do not publish sensitive logs, product keys, passwords, or other secrets in a public issue.

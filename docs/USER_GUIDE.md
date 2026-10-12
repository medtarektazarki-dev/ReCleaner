# REcleaner User Guide

## 1. What REcleaner does

REcleaner groups Windows diagnostics and maintenance actions in one desktop window. The Full System Scan is diagnostic: it gathers information and produces recommendations; it does not repair the PC on its own. Repairs and configuration changes are separate actions.

A health score is a summary of selected checks, not a guarantee that Windows is healthy or malware-free. Some checks may be unavailable because of permissions, Windows edition, system state, or the environment.

## 2. Download the build

The current workflow creates a temporary GitHub Actions artifact; it does not automatically publish a permanent Release.

1. Open [ReCleaner Actions](https://github.com/medtarektazarki-dev/ReCleaner/actions).
2. Open a successful **Build REcleaner for Windows** run from the intended source revision.
3. Find **Artifacts** near the bottom and download **REcleaner-Windows-x64**.
4. Extract the downloaded artifact ZIP. It should contain **REcleaner Setup.exe**, **REcleaner-win64.zip**, **REcleaner.ico**, and **SHA256SUMS.txt**.

GitHub Actions artifacts are temporary and are configured to expire after 30 days. Only use an artifact connected to a build run and source revision you trust.

### Check file hashes

In PowerShell, change to the folder containing the extracted files and run:

~~~powershell
Get-FileHash ".\REcleaner Setup.exe" -Algorithm SHA256
Get-FileHash ".\REcleaner-win64.zip" -Algorithm SHA256
Get-FileHash ".\REcleaner.ico" -Algorithm SHA256
~~~

Compare each SHA256 value with the matching entry in **SHA256SUMS.txt**. The checksum detects an accidental mismatch or corruption; it does not prove publisher identity because the checksum is distributed alongside the files.

## 3. Install or use the portable build

### Recommended: installer

1. Run **REcleaner Setup.exe** from the extracted artifact folder.
2. Read the Windows prompt and install confirmation before accepting.
3. The installer is designed to install for the current user under **%LOCALAPPDATA%\\Programs\\REcleaner**.
4. It creates Desktop and Start menu shortcuts. Launch REcleaner from one of those shortcuts.

### Portable ZIP

1. Extract **REcleaner-win64.zip** completely into a folder you control.
2. Run **REcleaner.exe** from inside that extracted folder.
3. Keep the other files next to it. **Do not copy or move REcleaner.exe on its own.**

## 4. Windows security warnings

The current workflow does not Authenticode-sign the executable. Windows may show an unknown-publisher or reputation warning for an unsigned/unrecognized application. That warning is not proof of malware, but it is also not something to bypass blindly.

- Do not disable Microsoft Defender, SmartScreen, firewall, or other protections to run REcleaner.
- If the file comes from an unknown source, the hash does not match, or your security software flags it, do not run it. Stop and investigate.
- Do not run the app as administrator just to open it. Elevation should only be used when the chosen action requires it.

## 5. Safe first run

1. Open REcleaner without elevation.
2. Start with **Full System Scan** and read its findings.
3. Review each suggested action before accepting it. Read the command preview or description where shown.
4. Keep personal files backed up before running repairs or cleanup.
5. Keep a laptop connected to power during long repairs.
6. Read the final status and activity details. A failed, unavailable, cancelled, or timed-out action must not be treated as success.

A restore point may be offered by Smart Repair, but it may be unavailable and does not replace a real backup. Windows repair commands may take a long time; do not power off the PC while DISM or System File Checker is working.

## 6. Understand the main areas

The app's interface can include these sections:

- **Overview / Full System Scan:** diagnostic readings and recommendations.
- **Optimize / Repair:** selected repair or cleanup operations; review the impact before confirming.
- **Disk:** disk checks and maintenance. Disk operations can take time and must not be interrupted casually.
- **Security:** selected Defender, firewall, hosts-file, and related controls. Security changes can reduce protection if used incorrectly.
- **Drivers:** inventory and driver-related operations. A driver update check is not the same as installing a driver.
- **Apps:** WinGet-based package operations. Review package identifiers and prompts before installing or updating software.
- **Users / Tweaks / Licensing:** account, configuration, or licensing operations can affect the system. Use only when you understand the target and have authorization.

Exact availability depends on the current build and Windows environment. Features that are not supported return an unavailable result rather than making a change.

## 7. Administrator access

Keep the application at standard user level for reading and low-risk checks. When an action requires elevation, REcleaner should explain that requirement and request Windows approval. Review the action before approving the elevation prompt.

If you decline the Windows prompt, the operation should stop. Do not use elevation to work around an error or an action marked unavailable.

## 8. Uninstall

Use Windows **Installed apps** if REcleaner is listed, or run **Uninstall.exe** from the installation folder. The bundled uninstaller is designed to remove REcleaner files and shortcuts, not Windows system files. If you used the portable ZIP, close the app and delete the extracted folder yourself.

## 9. Troubleshooting

- **Artifact is missing:** confirm you opened the correct successful build run and that its artifact has not expired.
- **The app does not launch:** re-extract the full portable ZIP or rerun the installer from a fresh artifact. Do not move only the EXE.
- **A repair reports Administrator access required:** retry only if you intended to run that specific action and understand its impact.
- **A command is unavailable:** note the status and Windows version; do not treat the absence of a result as a pass.
- **Security software blocks the file:** do not disable protection. Verify the source and hashes, then report the finding privately if it appears to be a false positive.

For a suspected security vulnerability, follow [SECURITY.md](../SECURITY.md) and do not publish sensitive logs or secrets in a public issue.
# Changelog

Notable changes to REcleaner are recorded here.

## Unreleased

### Fixed

- **System File Checker results were unreadable.** `sfc.exe` writes UTF-16 when its output is piped, so every result arrived with a NUL after each character and no pattern matched. System files could never be graded healthy and a repair could not confirm success. Output is now decoded correctly.
- **Repairs could stop halfway and leave services stopped.** `net stop` and `net start` exit with code 2 when a service is already in the requested state, so Windows Update repair, audio, Bluetooth, print queue, core services and the Windows Update and telemetry toggles aborted on the first service that was already stopped (or running) and left earlier-stopped services stopped. They now use `Stop-Service` / `Start-Service`, and every start step runs even when an earlier step failed.
- **Network reset skipped Winsock and IP reset** on any PC without a DHCP address, because `ipconfig /release` exits 1 there. The resets now run first and release/renew are best-effort.
- **A restore point was reported as created when Windows had silently declined it** (Windows normally allows one automatic point per 24 hours). Success now requires that a newer restore point exists afterwards; otherwise repairs that depend on it do not start and the message says why.
- **Reset hosts file overwrote its own previous backup** and wrote the new file even when the backup failed. Backups are timestamped and a failed backup stops the change.
- **Crash check reported dumps of any age** as evidence although its text says "last 30 days". It also read a hard-coded `C:\Windows`.
- **WMI check trusted the exit code of `winmgmt /verifyrepository`.** It now reads the verification result and reports Unknown if it cannot.
- **Defender in passive mode** (another antivirus installed) was graded as a problem. It is now Unknown, so it neither lowers the score nor claims protection.
- **CHKDSK on the Windows drive waited forever** for an answer to "schedule at next restart?" because standard input was an open pipe. Standard input is now closed, and answered only for the Windows drive.
- **The close dialog said "Nothing is left running" during a repair.** It now says that a Windows tool that already started can keep running.
- **A failure of the interface's own bridge** left the tool on "Running…" and an unhandled promise rejection. It now ends as an error result.
- **The product version was hard-coded in six places.** `package.json` is now the only source for the window, the executable resource and the installer's Apps & features entry.
- README named the installer `REcleaner Setup.exe`; the published file is `REcleaner.Setup.exe`.

### Security

- Reject a password beginning with `/` or `*` (it was parsed by `net user` as a switch or prompt, e.g. `/delete`).
- Refuse to delete, disable or demote the signed-in account, as the Accounts page already promised. Refuse to clear file attributes across the Windows drive, and to write a system image to it.
- Validate action ids and parameters with one shared function in both the Electron main process and the server function (the desktop copy previously had no length or key limits).
- Launch Windows tools by absolute `System32` path, and close standard input.
- Deny browser permission requests, block redirects and webview attachment in the Electron window.
- The uninstaller refuses an install folder that is a symbolic link or junction.
- The build workflow now installs a supported Go (`1.25.x`); it previously installed Go 1.22 while `go.mod` required 1.25, which made Go download exactly go1.25.0, the first unpatched release.
- The build workflow runs the type check and tests before it can publish a release.

### Licensing and distribution

- The build writes `THIRD_PARTY_LICENSES.txt` for the bundled npm packages, ships Go's `LICENSE-go.txt`, and includes `SECURITY.md` and `THIRD_PARTY.md` in the ZIP and installer. The repository still has no licence file for REcleaner itself.

### Tests

- Behavioural tests for process output decoding, standard input, timeouts, multi-step failure handling, boundary validation, target guards and restore-point classification; an allowlist of every program a plan can start; Go tests for the installer's archive extraction (including path traversal) and the uninstaller's folder rules; and a Chromium test of the built interface (`npm run test:ui`).

### Security (earlier)

- Restrict Electron IPC handlers to the bundled application's trusted main frame.
- Restrict top-level navigation to the bundled UI page.
- Verify the Electron Windows runtime download against the release's SHA-256 manifest before packaging.

### Build and distribution

- Pin GitHub Actions to full commit SHAs and pin the desktop packaging dependency versions.
- Add a separate CI workflow for type checking, tests, and lint.
- Verify the expected Windows output files and create SHA-256 checksums using the exact published filenames.
- Publish the installer, portable ZIP, icon, and checksum manifest as a source-revision-specific prerelease; keep a separate temporary Actions artifact.
- Document that Actions artifacts expire after 30 days and that the automated prerelease executables are not Authenticode-signed.

### Documentation

- Add a user guide, architecture overview, development guide, security policy, and contribution checklist.

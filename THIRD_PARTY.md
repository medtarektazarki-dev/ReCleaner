# Third-party notes

REcleaner does not vendor another project's source.

[ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil) was reviewed as research. It is MIT-licensed PowerShell. Its repair ideas (update components, WinGet, system fixes, administrator requirement) informed the safety rules only. No WinUtil script, branding, or interface is included.

Diagnostics and repairs call Windows programs that ship with Windows: DISM, SFC, PowerShell, netsh, ipconfig, winmgmt, WinGet, and the Windows Defender cmdlets. Those are used as installed on the PC. They are not copied into this repository.

No telemetry is sent. Full system scan does not upload logs, credentials, or personal files.

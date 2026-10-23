# Third-party notes

REcleaner does not vendor another project's source. The files it distributes do contain other projects' code, listed here.

## What a release contains

| Component | Where | Licence | Notice shipped as |
| --- | --- | --- | --- |
| [Electron](https://www.electronjs.org/) 44.7.0 Windows x64 runtime, which includes Chromium and its dependencies | `REcleaner.exe` and the files beside it | MIT (Electron); Chromium's components carry their own licences | `LICENSE` and `LICENSES.chromium.html`, unmodified from the Electron release; the runtime is checked against Electron's published SHA-256 list during the build |
| 31 npm packages compiled into the interface (React, React DOM, Radix UI dialog primitives, zustand, lucide-react, tailwind-merge, clsx, tslib and their small dependencies) | `resources/app/ui/assets` | MIT, ISC and 0BSD, as declared by each package | `resources/app/ui/THIRD_PARTY_LICENSES.txt`, generated at build time from the packages that are actually bundled. One package (`react-remove-scroll-bar`) ships no licence file; the generated file says so and gives its declared MIT licence |
| Go standard library, statically linked into `REcleaner.Setup.exe` and `Uninstall.exe` | the two installer programs | BSD-3-Clause | `LICENSE-go.txt`, copied from the Go toolchain used for the build |

The portable ZIP also contains this file and `SECURITY.md`. Build-time tools (Vite, Tailwind CSS, esbuild, resedit and others) are not distributed.

This table describes the build as designed. It is not legal advice and the notices have not been reviewed by a lawyer.

## Project licence

This repository does not currently contain a licence file for REcleaner's own code. Until its owner chooses one, others have no stated permission to copy, modify or redistribute it. Nothing in this repository grants one.

## Research references

[ChrisTitusTech/winutil](https://github.com/ChrisTitusTech/winutil) was reviewed as research. It is MIT-licensed PowerShell. Its repair ideas (update components, WinGet, system fixes, administrator requirement) informed the safety rules only. No WinUtil script, branding, or interface is included.

Diagnostics and repairs call Windows programs that ship with Windows: DISM, SFC, PowerShell, netsh, ipconfig, winmgmt, WinGet, and the Windows Defender cmdlets. Those are used as installed on the PC. They are not copied into this repository.

Diagnostics use the Windows commands documented by Microsoft. [Repair a Windows Image](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/repair-a-windows-image) distinguishes CheckHealth and ScanHealth from RestoreHealth. [sfc](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sfc) documents `/verifyonly` as a check and `/scannow` as a repair. No third-party diagnostic library was added.


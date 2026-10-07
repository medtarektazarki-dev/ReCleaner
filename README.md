# REcleaner

Windows Repair & Optimization Utility

Repair. Clean. Optimize.

REcleaner v1.0.0 is a Windows maintenance application. It checks the PC, repairs only when a check asks for it, and records what actually happened.

## What it solves

Windows repair is usually a pile of separate commands: image health, system files, disk checks, services, drivers, and cleanup. REcleaner puts those operations in one window, classifies the risk, and refuses to report success when a command did not run.

The product is based on the functionality of the original WindowsRepairToolPro utility. That batch file is kept in [`legacy/`](legacy/README.md) as a reference. REcleaner does not shell out to it.

## Capabilities

| Section | What it does |
| --- | --- |
| Overview | System health, system core, recommendations, scan, and smart repair |
| Optimize | Image health, system files, component cleanup, temporary files |
| Disk | Health, optimize, scheduled check, free-space wipe |
| Repair | Windows Update, Store, shell, audio, Bluetooth, print queue, services |
| Security | Defender, firewall, hosts file, telemetry |
| Drivers | Update check, list, backup, restore, remove |
| Apps | winget search, update, install, export, import |
| Maintenance | Opens the matching Windows tool |
| Users | Local accounts only |
| Tweaks | Individual performance and interface changes, plus restore |
| Licensing | Windows and Office license status, using a key you supply |

Smart repair runs a fixed sequence: system check, optional restore point, image check, system file check, temporary cleanup, service verification, and a final reading. A failed restore point stops the repair. Image and system-file repair start only when Windows reports that a repair is needed.

High-impact actions require an explicit confirmation. On a machine that is not Windows, those actions return unavailable and do not change anything.

## Architecture

```text
REcleaner window
  → action id (never a free-form command from the button)
    → plan in src/lib/recleaner/plans.ts
      → runner (desktop main process, or the preview server)
        → Windows process, captured output, exit code
          → result in the activity log
```

The desktop application is an Electron window with the system frame hidden. The page talks to the main process through a preload bridge. The main process is the only place that starts Windows programs. Each tool maps to one plan. Plans are an allowlist: the interface cannot pass an arbitrary command line.

Administrator rights are checked with `net session` before an action that needs them. If the process is not elevated, the result is `requires_admin` and the command is not started. Settings and the result dialog can restart REcleaner with `Start-Process -Verb RunAs`.

## Technology

- Interface: React 19, TypeScript, Tailwind CSS 4
- Preview and web build: TanStack Start
- Desktop shell: Electron 44 (Windows x64)
- Execution: Node `child_process` with a fixed argument list per plan
- Installer: Go setup program that unpacks the Windows build for the current user

## Development

Requirements: Node.js 22.

```bash
npm install
npm run dev
```

The development server listens on port 8080. In this environment that is the live preview. Repair commands that exist only on Windows stay unavailable here. Scan system reads the machine it is actually running on.

```bash
npm run typecheck
npm run build
```

## Build the Windows application

Requirements, in addition to Node.js 22:

- Go 1.22 or newer (`go version`)
- `curl` and `unzip`

Packaging dependencies are not required to run the preview:

```bash
npm install esbuild @resvg/resvg-js png-to-ico resedit
npm run desktop:build
```

`desktop:build` runs `node desktop/build.mjs`. That script:

1. Draws the icon from `desktop/brand/icon.svg` and writes `REcleaner.ico`.
2. Bundles the execution layer.
3. Builds the desktop interface with Vite (`vite.desktop.config.ts`).
4. Downloads the Electron 44 Windows x64 runtime if it is not already at `/tmp/electron-win.zip`.
5. Assembles `REcleaner.exe`, stamps the icon and version `1.0.0`, and builds `Uninstall.exe`.
6. Writes:

- `artifacts/REcleaner-win64.zip` — portable folder; start `REcleaner.exe` from inside the folder
- `artifacts/REcleaner Setup.exe` — installer for the current user
- `artifacts/REcleaner.ico`

The unpacked program is also at `/tmp/recleaner-stage/REcleaner.exe`. Do not move that executable by itself. It needs the files beside it.

### Installer

`REcleaner Setup.exe` asks before it copies files to `%LOCALAPPDATA%\Programs\REcleaner`, then creates Desktop and Start menu shortcuts. Uninstall is `Uninstall.exe` in that folder. It removes those shortcuts and the install folder. It does not remove Windows system files.

The setup program is the Go source in `desktop/installer/setup`. The uninstaller is `desktop/installer/uninstall`. `npm run desktop:build` compiles both for `windows/amd64`.

## Administrator privileges

REcleaner does not require elevation to open. Read-only checks that do not need an administrator run as the current user. Actions marked administrator call `net session` first. If that fails, the action stops with **Administrator access required** and offers **Restart as administrator**. The elevated process is a new instance of `REcleaner.exe`. Declining the Windows prompt is a failure, not a success.

## Version

Product version: **1.0.0**. The window shows `REcleaner v1.0.0` on the startup screen and in Settings. The Windows executable version resource uses the same number.

## Brand

The mark is the rounded frame in `desktop/brand/icon.svg`: an open corner index and a center core. `assets/branding/` and `assets/icons/` hold the same mark for the repository. It is not a studio logo, a shield, or a broom.

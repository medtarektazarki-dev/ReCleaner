# Security Policy

## Scope

Security reports are welcome for the current default branch and any build published by this repository. REcleaner is a Windows maintenance utility: some actions can change system settings or files and may run with administrator privileges. Treat it as security-sensitive software.

## Report a vulnerability privately

Please do **not** open a public issue with exploit details, sensitive logs, personal data, product keys, passwords, or a weaponized proof of concept.

1. Use GitHub's private vulnerability reporting / Security Advisory flow for this repository, if it is enabled: <https://github.com/medtarektazarki-dev/ReCleaner/security/advisories/new>.
2. If private reporting is unavailable, contact the repository maintainer privately through their GitHub profile and ask for a secure reporting channel.
3. Include the affected version or commit, Windows version/architecture, impact, exact reproduction steps, and any safe supporting evidence. Redact usernames, hostnames, tokens, product keys, and other personal data.

There is no published response-time or remediation-time guarantee. Please allow the maintainer time to investigate before public disclosure.

## Security design notes

The source currently includes these safeguards:

- Desktop renderer uses Electron settings **contextIsolation: true**, **nodeIntegration: false**, and **sandbox: true** in desktop/main.cjs.
- New windows are denied, top-level navigation is limited to the bundled UI page, and IPC handlers reject calls from unexpected frames or URLs.
- UI requests are action IDs mapped to allowlisted plans in src/lib/recleaner/plans.ts; process execution in src/lib/recleaner/runner.server.ts uses argument arrays with **shell: false**.
- Actions marked as administrator-required check the current Windows principal token before execution; failures are returned as `requires_admin` instead of starting the action.
- Full system scan is documented as diagnostic/read-only; repairs are separate actions.
- Requests from the interface are validated before they reach an action: an action id of lowercase letters, digits and dashes, at most eight short string parameters, and then the action's own per-field rules (src/lib/recleaner/request.ts and plans.ts). A parameter can fill a field the plan declares; it can never choose a program or add arguments.
- Windows tools are started from `%SystemRoot%\System32` by absolute path when they exist there, and standard input is closed so a tool cannot stop and wait for a keystroke.
- Some actions refuse targets that would harm the machine: rewriting file attributes across the Windows drive, writing a system image to it, or deleting, disabling or demoting the account you are signed in with.
- Passwords handed to `net user` cannot begin with `/` or `*`, which `net` would read as a switch or a prompt.
- Product keys and password lines are redacted from returned output and logs; the interface does not store passwords.

These controls reduce risk; they are **not** a claim that the application is vulnerability-free or has undergone an independent security audit. A valid action can still make consequential system changes.

### Known limitations

- **The installer is per-user.** REcleaner is installed under `%LOCALAPPDATA%\Programs\REcleaner`, a folder the signed-in user can write to. When REcleaner is started as administrator, Windows elevates a program that anything running as that same user could already have replaced. Elevation does not protect against malware that is already running as you. If that matters to you, run the portable ZIP from a folder only administrators can write to.
- **No Windows test environment ran this release.** The PowerShell and Windows command behaviour is covered by unit tests of the logic around it and by a scripted interface test, not by executing the commands on Windows. See `docs/windows-11-validation.md`.
- **Closing the window does not stop a Windows tool that already started.** DISM, SFC and CHKDSK keep running in the background, and nothing reports their result.

## Safe use

- Prefer source and build artifacts linked directly from this repository. Do not run repackaged binaries from file-sharing sites.
- The current Windows build workflow does not Authenticode-sign the executables. Windows may therefore display an unknown-publisher or reputation warning. **Do not disable Defender or SmartScreen to get past a warning.** If you cannot verify the origin or trust the build, do not run it.
- Run without administrator privileges unless a specific action requires it. Read the confirmation, command preview, and activity result before proceeding.
- Back up important data before repairs. A restore point, when available, is not a substitute for a backup.
- Do not post raw diagnostic output publicly without checking it for system details and secrets.

## Dependency and build security

The quality-check workflow has read-only repository permissions. The Windows build workflow uses `contents: write` only because it publishes versioned build assets to GitHub Releases; its checkout step disables persisted credentials. It checks generated files, writes SHA-256 checksums, and also uploads a temporary Actions artifact. Checksums help detect file corruption or mismatch; because the checksum file is distributed with the artifact, it is **not** a cryptographic signature and does not independently prove who produced the files.

Please report dependency vulnerabilities through the same private channel.
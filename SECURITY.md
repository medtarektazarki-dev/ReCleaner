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
- Actions marked as administrator-required are expected to check elevation before execution.
- Full system scan is documented as diagnostic/read-only; repairs are separate actions.

These controls reduce risk; they are **not** a claim that the application is vulnerability-free or has undergone an independent security audit. A valid action can still make consequential system changes.

## Safe use

- Prefer source and build artifacts linked directly from this repository. Do not run repackaged binaries from file-sharing sites.
- The current Windows build workflow does not Authenticode-sign the executables. Windows may therefore display an unknown-publisher or reputation warning. **Do not disable Defender or SmartScreen to get past a warning.** If you cannot verify the origin or trust the build, do not run it.
- Run without administrator privileges unless a specific action requires it. Read the confirmation, command preview, and activity result before proceeding.
- Back up important data before repairs. A restore point, when available, is not a substitute for a backup.
- Do not post raw diagnostic output publicly without checking it for system details and secrets.

## Dependency and build security

The quality-check workflow has read-only repository permissions. The Windows build workflow uses `contents: write` only because it publishes versioned build assets to GitHub Releases; its checkout step disables persisted credentials. It checks generated files, writes SHA-256 checksums, and also uploads a temporary Actions artifact. Checksums help detect file corruption or mismatch; because the checksum file is distributed with the artifact, it is **not** a cryptographic signature and does not independently prove who produced the files.

Please report dependency vulnerabilities through the same private channel.
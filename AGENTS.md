# ReCleaner — Agent Instructions

## Project scope
ReCleaner is a Windows repair and maintenance desktop app built with Electron, React, TypeScript, and Go installer/uninstaller helpers. These instructions apply to this repository. Do not follow unrelated App Builder, Grok, Vercel-preview, or game-specific instructions.

## Before changing code
- Read `README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and the relevant sections of `SECURITY.md`.
- For Windows repair actions, read `src/lib/recleaner/plans.ts`, its tests, `src/lib/recleaner/runner.server.ts`, its tests, and `docs/windows-11-validation.md`.
- For installer/uninstaller work, read the relevant Go source and tests under `desktop/installer/`.
- Reuse the existing architecture and test conventions. Avoid unrelated rewrites and new dependencies unless justified.

## Safety requirements
- Treat every action that changes Windows, services, registry, networking, accounts, boot/security settings, licenses, logs, or user files as potentially destructive.
- Prefer read-only diagnostics, least privilege, explicit per-action confirmation, clear previews, and reversible changes.
- Never silently chain diagnostics into repairs. Do not make high-risk actions automatic or part of a scan.
- Validate action IDs and every user-supplied field on the server. Do not rely on UI validation alone.
- Do not interpolate untrusted input into PowerShell, shell commands, registry paths, or filesystem paths. Use fixed allowlists and argument arrays; never enable shell execution for child processes.
- Preserve failure context. A failed step must not be reported as successful, and cleanup/restore steps must run when needed.
- Protect the Windows system drive, the signed-in account, user data, and installer/uninstaller path boundaries.
- Never claim Windows behavior is verified unless tests were actually run on Windows. Keep manual validation results blank until a human records real outcomes.
- Never publish a stable release from an unverified candidate. Preserve unsigned-build and licensing limitations in release notes.

## Validation
Run the applicable checks before claiming a change is complete:
- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run check:auth` with the required local server, where applicable
- `npm run desktop:build`
- Go tests and vet in both `desktop/installer/setup` and `desktop/installer/uninstall`
- Windows-target Go vet/build checks where applicable

Use the CI result as evidence, but distinguish Linux validation from real Windows 11 validation. Add regression tests for every bug fix. Do not claim checks passed if they were not run or if CI is still queued/running.

## Working practices
- Make focused, reviewable commits on a feature/fix branch; do not commit directly to `main`.
- Do not merge pull requests, publish releases, sign binaries, or choose a project license without explicit owner approval.
- Update docs and tests alongside behavior changes.
- Explain any unresolved risk and the exact verification still needed.

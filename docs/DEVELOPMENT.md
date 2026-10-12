# Development Guide

## Prerequisites

- Node.js 22
- npm (bundled with Node.js)
- Go 1.22 or newer for Windows packaging
- **curl**, **unzip**, **sha256sum**, and **python3** for packaging

## Install and run the app

From the repository root:

~~~bash
npm ci
npm run dev
~~~

The development server listens on port 8080. Windows-only maintenance actions should report unavailable when the app is running on a non-Windows host; do not interpret that as a passing Windows test.

## Checks before a change is merged

Run the checks relevant to the files changed:

~~~bash
npm run typecheck
npm test
npm run lint
~~~

The ordinary web build command is:

~~~bash
npm run build
~~~

Review the output and confirm the command completed successfully. Tests and a Linux build do not replace a smoke test on a real supported Windows machine.

## Build the Windows desktop package

The current packaging script uses Linux paths and commands (including **/tmp**, **mv**, **unzip**, and **python3**) and explicitly expects a non-Windows build host. **Do not run npm run desktop:build in native Windows Command Prompt or PowerShell.** The repository's GitHub Actions workflow on Ubuntu is the recommended build path.

On a compatible Linux environment:

~~~bash
npm ci
npm install --no-save --package-lock=false esbuild@0.28.2 @resvg/resvg-js@2.6.2 png-to-ico@3.0.2 resedit@3.1.0
npm run desktop:build
~~~

The packaging script downloads the Electron Windows x64 runtime and produces:

- **artifacts/REcleaner Setup.exe** — current-user installer.
- **artifacts/REcleaner-win64.zip** — portable folder; the executable must remain beside its bundled resources.
- **artifacts/REcleaner.ico** — application icon.

The build also stages files under **/tmp/recleaner-stage**. Generated binaries and build folders are ignored by Git and should not be committed.

## Continuous integration

Two workflows have separate responsibilities:

- [Quality Checks](../.github/workflows/quality.yml) runs TypeScript checks, the test suite, and lint on relevant pushes and pull requests.
- [Build REcleaner for Windows](../.github/workflows/build-windows.yml) packages and verifies the Windows x64 installer and portable ZIP.

Review both statuses before treating a change as ready. A green packaging run does not imply that the Quality Checks workflow passed; a green quality run does not prove the binary works on every Windows machine.

## GitHub Actions build

Workflow: [Build REcleaner for Windows](../.github/workflows/build-windows.yml).

- Triggered by relevant source changes on **main**, or manually with **Run workflow**.
- Runs with **contents: read** permission.
- Pins the GitHub Actions used by the workflow to full commit SHAs.
- Uses explicit versions for packaging dependencies.
- Verifies the downloaded Electron runtime against the official release SHA-256 list, verifies expected output files, checks that the portable ZIP contains REcleaner.exe, computes artifact SHA-256 checksums, then uploads the artifact.
- Upload artifact name: **REcleaner-Windows-x64**.
- Artifact retention: 30 days.

A green workflow means its configured build and verification steps passed. It does not certify the executable as malware-free, guarantee compatibility with every Windows installation, or replace Windows runtime testing.
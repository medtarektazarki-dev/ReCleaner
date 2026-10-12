# REcleaner Documentation

Start with the document that matches your task:

- [User Guide](USER_GUIDE.md) — download, install, first scan, repairs, elevation, troubleshooting, and uninstall.
- [Security Policy](../SECURITY.md) — safe-use rules and private vulnerability reporting.
- [Development Guide](DEVELOPMENT.md) — prerequisites, local checks, and Windows packaging.
- [Architecture](ARCHITECTURE.md) — trust boundaries, Electron processes, action plans, and execution flow.
- [Contributing](../CONTRIBUTING.md) — change, test, and review expectations.

## Important distribution note

The **Build REcleaner for Windows** workflow currently uploads a temporary GitHub Actions artifact named **REcleaner-Windows-x64**. Artifacts expire after 30 days. A successful build artifact is not the same as a permanent GitHub Release, and the current workflow does not code-sign the executables.

See the [Actions page](https://github.com/medtarektazarki-dev/ReCleaner/actions) and read the security instructions before running a downloaded binary.
# Architecture Overview

## Runtime flow

~~~text
React renderer (local UI)
    │ calls typed bridge methods
    ▼
desktop/preload.cjs (contextBridge)
    │ IPC action ID + bounded parameters
    ▼
desktop/main.cjs (Electron main process)
    │ executeAction(actionId, params)
    ▼
src/lib/recleaner/plans.ts (allowlisted plan)
    │ executable + explicit argument array
    ▼
src/lib/recleaner/runner.server.ts
    │ spawn(..., shell: false), capture output and exit status
    ▼
Windows command / tool → normalized result → activity UI
~~~

## Main modules

- **src/lib/recleaner/plans.ts:** known action IDs, argument plans, metadata, and input fields.
- **src/lib/recleaner/runner.server.ts:** action dispatch, validation flow, process execution, timeouts, status classification, and result redaction.
- **src/lib/recleaner/diagnostics and scan modules:** read system state and map findings to recommendations.
- **desktop/main.cjs:** Electron window lifecycle, settings, tray, notification, and IPC handlers.
- **desktop/preload.cjs:** narrow renderer-to-main bridge.
- **desktop/build.mjs:** packages the desktop UI, runner, Electron runtime, icon, installer, and uninstaller.
- **desktop/installer/setup and desktop/installer/uninstall:** Go-based Windows setup and removal programs.

## Security boundaries

The desktop window currently sets **contextIsolation: true**, **nodeIntegration: false**, and **sandbox: true**. It denies new windows and blocks navigation away from the local file page. Process execution is based on known plans rather than a free-form shell command from the interface; the runner uses spawn with **shell: false**.

These are important controls but not a complete threat model. Renderer vulnerabilities, an unsafe plan, flawed parameter validation, dependency compromise, or a privileged operation with unintended side effects can still cause harm. Review IPC sender validation and input-to-command handling whenever changing the renderer, preload, plans, or runner.

## Diagnostic versus mutating operations

Full System Scan is intended to read system state and suggest actions. Repairs, deletions, driver operations, registry tweaks, network/security changes, app installations, and licensing operations are separate plans and may have significant side effects. Do not add destructive commands to a scan path. A command must return an accurate status and must not report success when it did not complete.

## Design rules for new actions

1. Add an explicit, stable action ID and typed metadata to the plan registry.
2. Define accepted fields and validate values at the boundary. Never construct an arbitrary executable path or free-form command from renderer input.
3. Use executable-plus-argument arrays with shell execution disabled wherever possible.
4. Mark administrator requirements accurately and check them before the operation.
5. Set appropriate timeouts; do not kill DISM or SFC mid-operation without a deliberate, reviewed design.
6. Separate diagnostics from mutations. Destructive or high-impact operations need a clear confirmation and honest description.
7. Redact secrets and sensitive output before showing or storing results.
8. Add automated tests for input validation, allowlisting, failure states, timeouts, and redaction.
9. Update the user guide when behavior, risks, requirements, or installation changes.
10. Never claim an operation succeeded from a button click alone; use the actual command result.
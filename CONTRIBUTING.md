# Contributing to REcleaner

Thanks for helping improve REcleaner. Prefer small, focused changes that can be reviewed and tested independently.

## Before changing code

1. Read [the architecture overview](docs/ARCHITECTURE.md), [user guide](docs/USER_GUIDE.md), and [security policy](SECURITY.md).
2. Identify whether the change is diagnostic-only or mutates Windows state.
3. Avoid unrelated refactors in security-sensitive execution code.
4. Never commit passwords, product keys, access tokens, private diagnostic output, generated binaries, or local environment files.

## Required checks

Run the checks relevant to your change:

~~~bash
npm run typecheck
npm test
npm run lint
~~~

For UI or desktop changes, also run the appropriate build and test on a Windows x64 system. A green Linux packaging workflow confirms packaging checks passed; it is not a substitute for exercising the app and repair actions on Windows.

## Security review checklist

- [ ] Action IDs resolve only to explicitly registered plans.
- [ ] Parameters are validated and cannot alter the executable or inject extra command arguments.
- [ ] Process execution does not use a shell to execute user-provided input.
- [ ] Privilege requirements are accurate and checked before execution.
- [ ] Diagnostic-only paths do not perform repairs or cleanup.
- [ ] Destructive or high-impact actions describe consequences and require deliberate confirmation.
- [ ] Errors, unavailable states, cancellations, and timeouts are not reported as success.
- [ ] Secrets and sensitive system details are redacted before they appear in UI results or logs.
- [ ] Tests cover success and failure paths, not only the happy path.
- [ ] User-facing documentation is updated when commands, risk, requirements, or downloads change.

## Pull requests

Describe the problem, the approach, the affected Windows versions (if known), commands/tests run, and residual risks. Include screenshots for UI changes when useful, but never include secrets or unredacted diagnostic data.

For a suspected vulnerability, do not open a public issue with exploit details. Follow the private reporting process in [SECURITY.md](SECURITY.md).
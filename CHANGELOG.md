# Changelog

Notable changes to REcleaner are recorded here.

## Unreleased

### Security

- Restrict Electron IPC handlers to the bundled application's trusted main frame.
- Restrict top-level navigation to the bundled UI page.
- Verify the Electron Windows runtime download against the release's SHA-256 manifest before packaging.

### Build and distribution

- Pin GitHub Actions to full commit SHAs and pin the desktop packaging dependency versions.
- Verify the expected Windows output files and create SHA-256 checksums for the uploaded artifact.
- Document that Actions artifacts expire after 30 days and that the current executable workflow does not Authenticode-sign the binaries.

### Documentation

- Add a user guide, architecture overview, development guide, security policy, and contribution checklist.

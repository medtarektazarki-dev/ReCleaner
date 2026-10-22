# Windows 11 validation

REcleaner can prove its scoring, allowlist, and repair rules on any machine that can run the unit tests. It cannot prove that Windows accepted a command unless that command ran on Windows 11.

This file was prepared on Linux. Actual result and Pass/Fail stay empty until a person runs the step on Windows 11.

## What Linux can prove

- The test suite, typecheck, lint, and web build.
- Full System Scan action IDs are a fixed read-only set.
- Those actions are not DISM RestoreHealth, `sfc /scannow`, file deletion, service changes, firewall changes, Defender changes, Wi-Fi key reads, or product-key installs.
- Unknown actions are rejected.
- A scan line with no grade is not scored as healthy.
- Repair order is DISM, then SFC, then the other approved repairs.
- Product-key and password lines are removed from returned text.

## What requires Windows 11

Every row below. Build 22000 or newer. Linux cannot execute the Windows programs.

## Legend

| Class | Meaning |
|---|---|
| AUTOMATED | Covered by unit tests. Still confirm the live Windows result. |
| MANUAL WINDOWS | A person must run it on Windows 11. |
| ADMIN REQUIRED | The command is not started unless the process is elevated. |
| REBOOT REQUIRED | Windows may ask for a restart. Do not reboot unless you meant to. |
| DESTRUCTIVE / HIGH RISK | Do not run this as part of an unattended pass. A person must confirm it. |

Full System Scan is MANUAL WINDOWS and, for most checks, ADMIN REQUIRED. It is not destructive. It must not be followed automatically by a repair.

These must never be automated:

- DISM RestoreHealth
- `sfc /scannow`
- Windows Update component rename
- Temporary-file cleanup
- Enabling the firewall
- Any Advanced tool that changes boot mode, editions, licenses, services, or files
- Secure wipe
- Debloat
- Disabling Windows Update

## Checklist

| Test ID | Class | Purpose | Preconditions | Exact action | Expected result | Actual result | Pass/Fail | Notes |
|---|---|---|---|---|---|---|---|---|
| A | MANUAL WINDOWS | The app opens | Windows 11, built `REcleaner.exe` | Start `REcleaner.exe` | The window title is REcleaner | | | |
| B | MANUAL WINDOWS, ADMIN REQUIRED | Scan is read-only | Administrator | Click Full system scan and wait | Each line waits for its own result. No repair starts | | | |
| C | AUTOMATED, MANUAL WINDOWS | Score uses only measured checks | A finished scan | Read the score | Unknown checks are left out. If nothing was measured, the screen says Not scored, not 0 | | | |
| D | MANUAL WINDOWS, ADMIN REQUIRED | Image check does not repair | Administrator | Read the Windows image line and its details | CheckHealth runs. ScanHealth runs only if CheckHealth is inconclusive. RestoreHealth does not run | | | |
| E | MANUAL WINDOWS, ADMIN REQUIRED | File check does not repair | Administrator | Read the system files line | `sfc /verifyonly` runs. `sfc /scannow` does not | | | DISM and SFC must not be killed if you cancel |
| F | DESTRUCTIVE / HIGH RISK, ADMIN REQUIRED, MANUAL WINDOWS | Update repair only after approval | A scan that recommends it | Approve only that repair | SoftwareDistribution and catroot2 are renamed, not deleted. The update check runs again | | | Do not automate |
| G | MANUAL WINDOWS, ADMIN REQUIRED | Firewall stays unchanged | A PC whose firewall state is known | Read the firewall line. Open Review & repair only if it is off | Enable Windows Firewall is unchecked. It does not turn on unless you check it | | | Enabling it is HIGH RISK |
| H | MANUAL WINDOWS, ADMIN REQUIRED | Service startup type | Administrator | Read the services line | A stopped automatic service is reported. A stopped manual or disabled service is not called broken. Nothing is started | | | |
| I | MANUAL WINDOWS | Network stays unchanged | A network connection, if you want the HTTPS check | Read the network line | Flush DNS cache is unchecked if it appears. Network reset is not offered | | | The HTTPS check needs network access |
| J | MANUAL WINDOWS | Disk is measured, not cleaned | A real system disk. SMART data only if the storage driver exposes it | Read the disk line | Free space comes from the PC. Unknown disk health is not called critical. Nothing is deleted | | | |
| K | MANUAL WINDOWS | Crash evidence is a summary | Optional: a minidump or bugcheck from the last 30 days | Read the crashes line | A count or bugcheck code may appear. Dump files stay. The full event text does not | | | |
| L | MANUAL WINDOWS | WMI failure stays local | Administrator | Read the system management line | A CIM failure is only that line. Later checks still run | | | |
| M | MANUAL WINDOWS | WinGet is not an installer | WinGet may be missing | Read the applications line | No package is installed or removed. A missing WinGet does not lower the score by itself | | | |
| N | MANUAL WINDOWS, ADMIN REQUIRED | Cancel does not invent a score | A scan in progress | Cancel after at least one check has started | The current check finishes. Later checks do not start. The score says Not scored | | | |
| O | DESTRUCTIVE / HIGH RISK, ADMIN REQUIRED, MANUAL WINDOWS | Repair waits for approval | A scan with at least one recommendation | Open Review & repair. Leave the restore point unchecked, then try it once on a machine you can restore | Only checked repairs run. A failed restore point stops the repairs | | | Do not automate |
| P | MANUAL WINDOWS, ADMIN REQUIRED | Verification is a new check | A repair you approved | Read the verify line after the repair | The related diagnostic runs again. A warning grade is not shown as fixed | | | A reboot may be required before Windows reports the new state |
| Q | MANUAL WINDOWS | Non-admin is not healthy | Start REcleaner without administrator rights | Run Full system scan | Checks that need an administrator say so. They are not scored as healthy | | | |
| R | MANUAL WINDOWS, ADMIN REQUIRED | `sfc /verifyonly` output is read correctly | Administrator | Run Full system scan; open Details for System files | The line is graded from SFC's own wording (healthy, or integrity violations found). Details text has no gaps between letters. It is not "did not provide a recognized clean result" | | | sfc.exe writes UTF-16 when piped. Localized Windows prints non-English text and will legitimately stay Unknown |
| S | MANUAL WINDOWS, ADMIN REQUIRED | Service repairs work when the service is already stopped | Administrator; stop Bluetooth Support Service first | Repair > Bluetooth, then Audio, Print queue, Core services | Each finishes and the services are Running afterwards. None stops at "returned a non-zero exit code" | | | `net stop` used to exit 2 here and abort the chain. `Stop-Service -Force` also stops dependent services and nothing restarts them: note any that stay stopped |
| T | DESTRUCTIVE / HIGH RISK, ADMIN REQUIRED, MANUAL WINDOWS | A failed step does not leave a service stopped | A test PC; make `C:\Windows\SoftwareDistribution` temporarily un-deletable, or use a VM snapshot | Repair > Repair Windows Update | If the cache step fails, Windows Update, BITS and Cryptographic Services are still started and the result says what failed | | | Do not automate |
| U | MANUAL WINDOWS, ADMIN REQUIRED | Restore point is only reported when one exists | Administrator | Run a repair with "restore point" twice within 24 hours | The second attempt reports that Windows did not create a new restore point and the dependent repair does not start. "Continue without one" still works | | | Check System Protection > Restore points |
| V | MANUAL WINDOWS, ADMIN REQUIRED | Network reset on a static address | A PC with a static IP, or no cable | Optimize > Reset network | Winsock reset and IP reset ran. Release and renew are listed as optional steps. The result is not a failure just because release found no DHCP adapter | | | May need a restart; the connection drops briefly |
| W | MANUAL WINDOWS, ADMIN REQUIRED | CHKDSK does not hang | Administrator | Disk > Schedule disk check for C, then for a data drive that is in use | C is scheduled for the next restart and the action returns. The data drive fails promptly with CHKDSK's message instead of waiting until the time limit | | | Run `chkntfs C:` to confirm, then Cancel scheduled check |
| X | DESTRUCTIVE / HIGH RISK, ADMIN REQUIRED, MANUAL WINDOWS | The signed-in account is protected | A disposable VM with a second local account | Accounts > Delete account, Disable account, Make standard user, each with your own username | Each is refused with "will not change the account you are signed in with". Another account is accepted | | | Do not run on a real PC |
| Y | MANUAL WINDOWS | Unhide files refuses the Windows drive | Windows | Disk > Unhide files with C | Refused before anything runs. A USB drive letter is accepted | | | |
| Z | DESTRUCTIVE / HIGH RISK, ADMIN REQUIRED, MANUAL WINDOWS | Hosts file backup survives a second reset | A disposable VM; add a marker line to the hosts file | Security > Reset hosts file, twice | Two `hosts.recleaner-<time>.bak` files exist in `System32\drivers\etc`; the first contains the marker line | | | |
| AA | MANUAL WINDOWS | Passive Defender, WMI and old dumps | A PC with another antivirus; a minidump older than 30 days | Run Full system scan | Security is Unknown (passive mode), not a warning. System management reflects `winmgmt /verifyrepository`. Crashes ignores the old dump | | | |
| AB | MANUAL WINDOWS | Install, uninstall, unusual paths | A clean user profile, ideally with a space or non-ASCII character in the user name | Run REcleaner.Setup.exe; check Apps & features; run Uninstall.exe from the installed folder and from an extracted ZIP | The version in Apps & features equals the one in Settings. Installed copy is removed. The ZIP copy is refused with the portable-copy message and nothing is deleted | | | Also confirm SmartScreen wording for an unsigned file |
| AC | MANUAL WINDOWS | Starting as administrator | Standard user with UAC | Settings > Restart as administrator | A new elevated instance opens. Declining the prompt shows a failure, not success | | | |
| AD | MANUAL WINDOWS | Windows tools start from System32 | Process Monitor or Task Manager > Details > Command line | Run any action, for example Flush DNS | The program launched is `C:\Windows\System32\ipconfig.exe` | | | |

## How to record a result

Write what Windows actually showed. If you did not run the step, leave Actual result and Pass/Fail blank.

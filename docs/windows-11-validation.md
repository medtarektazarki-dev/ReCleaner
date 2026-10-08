# Windows 11 validation

This checklist is for a real Windows 11 PC. Build 22000 or newer.

The rows below were **not** executed on Windows 11 in the environment that prepared this file. Do not treat them as a pass.

| Test | Action | Expected result | Actual result | Pass/Fail |
|---|---|---|---|---|
| A. Launch | Start `REcleaner.exe` | The window opens. The title is REcleaner. | Not yet tested on Windows 11 | Not tested |
| B. Full scan | Click Full system scan | Each check waits for its own result. No repair starts. | Not yet tested on Windows 11 | Not tested |
| C. Score | Read the score after a finished scan | The number uses only measured categories. Unknown checks are left out. If nothing was measured, the screen says Not scored. | Not yet tested on Windows 11 | Not tested |
| D. DISM | Read the Windows image line | CheckHealth runs. ScanHealth runs only when CheckHealth is inconclusive. RestoreHealth does not run during the scan. | Not yet tested on Windows 11 | Not tested |
| E. SFC | Read the system files line | `sfc /verifyonly` runs. `sfc /scannow` does not run during the scan. | Not yet tested on Windows 11 | Not tested |
| F. Windows Update | If a repair is offered and approved | SoftwareDistribution and catroot2 are renamed, not deleted. The update diagnostic runs again. | Not yet tested on Windows 11 | Not tested |
| G. Firewall | Read the firewall line, then open Review & repair if it is off | Enable Windows Firewall is unchecked. It does not turn on unless that box is checked. | Not yet tested on Windows 11 | Not tested |
| H. Services | Read the services line | A stopped automatic service is reported. A stopped manual or disabled service is not reported as broken. | Not yet tested on Windows 11 | Not tested |
| I. Network | Read the network line | Flush DNS cache is unchecked if it appears. Network reset does not appear. | Not yet tested on Windows 11 | Not tested |
| J. Disk | Read the disk line | Free space and disk health come from the PC. Nothing is deleted during the scan. | Not yet tested on Windows 11 | Not tested |
| K. Crash evidence | Read the crashes line | Recent dump or bugcheck evidence is summarized. Dump files are not deleted. The full event message is not shown. | Not yet tested on Windows 11 | Not tested |
| L. WMI | Read the system management line | A CIM failure stays on that line. Later checks still run. | Not yet tested on Windows 11 | Not tested |
| M. WinGet | Read the applications line | WinGet is not used to install or remove packages. Its availability does not change the score by itself. | Not yet tested on Windows 11 | Not tested |
| N. Cancellation | Cancel during a scan | The current check finishes. Later checks do not start. DISM and SFC are not killed. The score says Not scored. | Not yet tested on Windows 11 | Not tested |
| O. Repair | Approve only the checked repairs | Only those actions run. Create a restore point starts unchecked. A failed restore point stops the repairs. | Not yet tested on Windows 11 | Not tested |
| P. Verification | After an approved repair | The related diagnostic runs again. The screen does not say fixed unless that check agrees. | Not yet tested on Windows 11 | Not tested |
| Q. Non-admin | Run the scan without administrator rights | Checks that need an administrator say so. They are not scored as healthy. | Not yet tested on Windows 11 | Not tested |

Automated tests in this repository do not replace this checklist.

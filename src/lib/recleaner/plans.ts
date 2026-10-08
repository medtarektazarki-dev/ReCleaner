export type FieldKey =
  | "drive"
  | "minutes"
  | "user"
  | "password"
  | "newName"
  | "packageId"
  | "productKey"
  | "exePath"
  | "publishedName"
  | "edition";

export type FieldType = "drive" | "number" | "text" | "secret" | "choice";

export type FieldMeta = {
  label: string;
  type: FieldType;
  hint?: string;
  options?: { value: string; label: string }[];
};

export const EDITIONS: { value: string; label: string; key: string }[] = [
  { value: "Professional", label: "Windows Pro", key: "W269N-WFGWX-YVC9B-4J6C9-T83GX" },
  { value: "ProfessionalN", label: "Windows Pro N", key: "MH37W-N47XK-V7XM9-C7227-GCQG9" },
  { value: "ProfessionalWorkstation", label: "Windows Pro for Workstations", key: "NRG8B-VKK3Q-CXVCJ-9G2XF-6Q84J" },
  { value: "Education", label: "Windows Education", key: "NW6C2-QMPVW-D7KKK-3GKT6-VCFB2" },
  { value: "Enterprise", label: "Windows Enterprise", key: "NPPR9-FWDCX-D2C8J-H872K-2YT43" },
];

export const FIELD_META: Record<FieldKey, FieldMeta> = {
  drive: { label: "Drive letter", type: "drive", hint: "Example: C" },
  minutes: { label: "Minutes", type: "number", hint: "1–720" },
  user: { label: "Username", type: "text", hint: "Letters, numbers, dot, dash" },
  password: { label: "Password", type: "secret", hint: "Leave empty for no password" },
  newName: { label: "New username", type: "text" },
  packageId: { label: "Package id", type: "text", hint: "Example: Google.Chrome" },
  productKey: { label: "Product key", type: "secret", hint: "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" },
  exePath: { label: "Program path", type: "text", hint: "Full path ending in .exe" },
  publishedName: { label: "Published name", type: "text", hint: "Example: oem12.inf" },
  edition: {
    label: "Target edition",
    type: "choice",
    options: EDITIONS.map((e) => ({ value: e.value, label: e.label })),
  },
};

export type Step = { label: string; file: string; args: string[] };

export type Plan = {
  id: string;
  title: string;
  windowsOnly: boolean;
  admin: boolean;
  timeoutMs: number;
  kind?: "host" | "dism" | "dism-check" | "sfc" | "sfc-verify" | "services" | "clean-temp" | "driver-scan" | "relaunch" | "edition" | "office-remove" | "probe";
  fields?: FieldKey[];
  optional?: FieldKey[];
  steps?: Step[];
  notes?: string[];
};

const PLANS: Record<string, Plan> = {};

function add(plan: Plan) {
  PLANS[plan.id] = plan;
}

function regAdd(label: string, path: string, name: string, type: string, data: string): Step {
  if (!name) {
    return { label, file: "reg.exe", args: ["add", path, "/ve", "/d", data, "/f"] };
  }
  return { label, file: "reg.exe", args: ["add", path, "/v", name, "/t", type, "/d", data, "/f"] };
}

function regDel(label: string, path: string, name?: string): Step {
  const args = ["delete", path];
  if (name) args.push("/v", name);
  args.push("/f");
  return { label, file: "reg.exe", args };
}

function ps(label: string, command: string): Step {
  return { label, file: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command] };
}

const DNS = "Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | ";

add({
  id: "host-read",
  title: "Host reading",
  windowsOnly: false,
  admin: false,
  timeoutMs: 15000,
  kind: "host",
  notes: ["Read processor, memory, uptime, platform, and administrator state. No changes."],
});

add({
  id: "relaunch-admin",
  title: "Restart as administrator",
  windowsOnly: true,
  admin: false,
  timeoutMs: 20000,
  kind: "relaunch",
  notes: ["Start-Process -Verb RunAs on the REcleaner executable, when one is present."],
});

add({
  id: "dism-smart",
  title: "Image health",
  windowsOnly: true,
  admin: true,
  timeoutMs: 900000,
  kind: "dism",
  notes: [
    "DISM /Online /Cleanup-Image /CheckHealth",
    "DISM /Online /Cleanup-Image /ScanHealth",
    "Repair-WindowsImage -Online -CheckHealth",
    "DISM /Online /Cleanup-Image /RestoreHealth — only when the image is Repairable",
  ],
});

add({
  id: "sfc-smart",
  title: "System file check",
  windowsOnly: true,
  admin: true,
  timeoutMs: 1200000,
  kind: "sfc",
  notes: [
    "sfc /verifyonly",
    "sfc /scannow — only when verification reports integrity violations",
  ],
});

add({
  id: "services-diagnostic",
  title: "Service verification",
  windowsOnly: true,
  admin: true,
  timeoutMs: 60000,
  kind: "services",
  notes: ["Read-only check of core Windows services. Nothing is started or stopped."],
});

add({
  id: "clean-temp",
  title: "Temporary cleanup",
  windowsOnly: true,
  admin: true,
  timeoutMs: 180000,
  kind: "clean-temp",
  notes: [
    "Clears user temp, Windows temp, prefetch, and thumbnail caches.",
    "Does not remove Windows.old.",
  ],
});

add({
  id: "driver-scan",
  title: "Driver update check",
  windowsOnly: true,
  admin: true,
  timeoutMs: 180000,
  kind: "driver-scan",
  notes: ["Microsoft.Update.Session search for uninstalled drivers. Does not install them."],
});

add({
  id: "win-edition",
  title: "Change Windows edition",
  windowsOnly: true,
  admin: true,
  timeoutMs: 300000,
  kind: "edition",
  fields: ["edition"],
  notes: [
    "DISM /Online /Get-TargetEditions",
    "changepk.exe /ProductKey <public setup key> — only if that edition is a reported target",
  ],
});

add({
  id: "office-uninstall",
  title: "Uninstall Office",
  windowsOnly: true,
  admin: true,
  timeoutMs: 900000,
  kind: "office-remove",
  notes: [
    "Detect Click-to-Run Office. If found, download the Office Deployment Tool and remove all Click-to-Run products.",
  ],
});

function sequential(
  id: string,
  title: string,
  steps: Step[],
  extra?: Partial<Pick<Plan, "fields" | "optional" | "timeoutMs" | "admin" | "notes">>,
) {
  add({
    id,
    title,
    windowsOnly: true,
    admin: extra?.admin ?? true,
    timeoutMs: extra?.timeoutMs ?? 120000,
    steps,
    fields: extra?.fields,
    optional: extra?.optional,
    notes: extra?.notes,
  });
}

sequential("component-cleanup", "Component store cleanup", [
  { label: "Start component cleanup", file: "dism.exe", args: ["/Online", "/Cleanup-Image", "/StartComponentCleanup"] },
]);

sequential("clean-updates", "Old update cleanup", [
  {
    label: "Reset component base",
    file: "dism.exe",
    args: ["/Online", "/Cleanup-Image", "/StartComponentCleanup", "/ResetBase"],
  },
  ps("Remove Windows.old if present", "if (Test-Path 'C:\\Windows.old') { Remove-Item 'C:\\Windows.old' -Recurse -Force -ErrorAction SilentlyContinue }"),
], { timeoutMs: 600000 });

sequential("clean-dumps", "Crash dump cleanup", [
  ps(
    "Remove dump files",
    "Remove-Item -Force -ErrorAction SilentlyContinue \"$env:SystemRoot\\Minidump\\*\", \"$env:SystemRoot\\MEMORY.DMP\", \"$env:SystemRoot\\Logs\\CBS\\*.cab\"",
  ),
]);

sequential("internet-reset", "Network reset", [
  { label: "Flush DNS", file: "ipconfig.exe", args: ["/flushdns"] },
  { label: "Release", file: "ipconfig.exe", args: ["/release"] },
  { label: "Renew", file: "ipconfig.exe", args: ["/renew"] },
  { label: "Reset Winsock", file: "netsh.exe", args: ["winsock", "reset"] },
  { label: "Reset IP", file: "netsh.exe", args: ["int", "ip", "reset"] },
], { timeoutMs: 180000 });

sequential("clean-events", "Clear event logs", [
  ps("Clear logs", "wevtutil el | ForEach-Object { wevtutil cl $_ }"),
], { timeoutMs: 180000 });

sequential("clean-delivery", "Delivery optimization cache", [
  ps(
    "Clear delivery cache",
    "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue 'C:\\Windows\\SoftwareDistribution\\DeliveryOptimization\\*'",
  ),
]);

sequential("clear-gpu", "GPU cache", [
  ps(
    "Clear shader caches",
    "$paths = @(\"$env:LOCALAPPDATA\\NVIDIA\\DXCache\",\"$env:LOCALAPPDATA\\NVIDIA\\GLCache\",\"$env:LOCALAPPDATA\\NVIDIA Corporation\\NV_Cache\",\"$env:LOCALAPPDATA\\AMD\\DxCache\",\"$env:LOCALAPPDATA\\AMD\\GLCache\",\"$env:LOCALAPPDATA\\D3DSCache\"); foreach ($p in $paths) { if (Test-Path $p) { Remove-Item \"$p\\*\" -Recurse -Force -ErrorAction SilentlyContinue } }",
  ),
]);

sequential("ram-note", "Memory trim", [
  ps(
    "Report standby memory",
    "$os = Get-CimInstance Win32_OperatingSystem; 'FreePhysicalMB=' + [math]::Round($os.FreePhysicalMemory/1024,0); 'REcleaner does not download third-party memory tools. Use the standby list only through Windows itself.'; exit 0",
  ),
], { notes: ["Does not download RAMMap. Reports free physical memory only."] });

sequential("restore-point", "Restore point", [
  ps(
    "Create restore point",
    "Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue; Checkpoint-Computer -Description 'REcleaner' -RestorePointType 'MODIFY_SETTINGS'",
  ),
], { timeoutMs: 180000 });

sequential("chkdsk", "Schedule disk check", [
  { label: "Schedule CHKDSK", file: "chkdsk.exe", args: ["{{drive}}:", "/f", "/r"] },
], { fields: ["drive"], timeoutMs: 300000, notes: ["The system drive is scheduled for the next restart. Other drives may start immediately."] });

sequential("chkdsk-cancel", "Cancel scheduled check", [
  { label: "Exclude drive from auto-check", file: "chkntfs.exe", args: ["/x", "{{drive}}:"] },
], { fields: ["drive"] });

sequential("defrag", "Optimize drive", [
  { label: "Optimize", file: "defrag.exe", args: ["{{drive}}:", "/O", "/U", "/V"] },
], { fields: ["drive"], timeoutMs: 600000 });

sequential("smart-health", "Disk health", [
  ps("Physical disk health", "Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus | Format-Table -AutoSize | Out-String -Width 200"),
], { admin: false });

sequential("disk-info", "Storage information", [
  ps(
    "Volumes",
    "Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter, FileSystemLabel, FileSystem, @{n='SizeGB';e={[math]::Round($_.Size/1GB,2)}}, @{n='FreeGB';e={[math]::Round($_.SizeRemaining/1GB,2)}} | Format-Table -AutoSize | Out-String -Width 200",
  ),
], { admin: false });

sequential("secure-wipe", "Wipe free space", [
  { label: "Cipher wipe", file: "cipher.exe", args: ["/w:{{drive}}:"] },
], { fields: ["drive"], timeoutMs: 900000 });

sequential("disk-speed", "Disk speed", [
  { label: "Winsat", file: "winsat.exe", args: ["disk", "-drive", "{{drive}}"] },
], { fields: ["drive"], timeoutMs: 300000 });

sequential("usb-rescue", "Unhide files", [
  { label: "Clear hidden attributes", file: "attrib.exe", args: ["-h", "-r", "-s", "/s", "/d", "{{drive}}:\\*.*"] },
], { fields: ["drive"], timeoutMs: 300000 });

sequential("write-protect", "Clear write protection", [
  regAdd("Storage policy", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies", "WriteProtect", "REG_DWORD", "0"),
  ps(
    "Clear disk readonly",
    "$d = '{{drive}}'; $script = Join-Path $env:TEMP 'recleaner-wp.txt'; Set-Content $script \"select volume $d`r`nattributes disk clear readonly\"; diskpart /s $script; Remove-Item $script -Force -ErrorAction SilentlyContinue",
  ),
], { fields: ["drive"] });

sequential("ultimate-perf", "Ultimate performance", [
  ps(
    "Duplicate and activate the ultimate scheme",
    "$raw = powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 | Out-String; if ($raw -match '[0-9a-fA-F-]{36}') { powercfg /setactive $Matches[0]; New-Item -ItemType Directory -Force C:\\REcleaner | Out-Null; Add-Content C:\\REcleaner\\schemes.txt $Matches[0]; 'Active=' + $Matches[0]; exit 0 } else { 'Could not create the scheme.'; exit 1 }",
  ),
]);

sequential("balanced", "Balanced power", [
  { label: "Activate balanced", file: "powercfg.exe", args: ["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"] },
  ps(
    "Remove schemes REcleaner created",
    "if (Test-Path C:\\REcleaner\\schemes.txt) { Get-Content C:\\REcleaner\\schemes.txt | ForEach-Object { powercfg -delete $_.Trim() }; Remove-Item C:\\REcleaner\\schemes.txt -Force }",
  ),
]);

sequential("shutdown-schedule", "Schedule shutdown", [
  ps(
    "Schedule shutdown",
    "$m = [int]'{{minutes}}'; if ($m -lt 1 -or $m -gt 720) { exit 1 }; shutdown /s /t ($m * 60)",
  ),
], { fields: ["minutes"] });

sequential("shutdown-cancel", "Cancel shutdown", [
  { label: "Abort shutdown", file: "shutdown.exe", args: ["/a"] },
]);

sequential("bios-restart", "Restart to firmware", [
  { label: "Firmware restart", file: "shutdown.exe", args: ["/r", "/fw", "/t", "5"] },
]);

sequential("safe-mode", "Safe mode", [
  { label: "Set safeboot", file: "bcdedit.exe", args: ["/set", "{current}", "safeboot", "minimal"] },
  { label: "Restart", file: "shutdown.exe", args: ["/r", "/t", "5"] },
]);

sequential("normal-mode", "Normal boot", [
  { label: "Clear safeboot", file: "bcdedit.exe", args: ["/deletevalue", "{current}", "safeboot"] },
  { label: "Restart", file: "shutdown.exe", args: ["/r", "/t", "5"] },
]);

sequential("debloat", "Remove provisioned apps", [
  ps(
    "Remove selected inbox apps",
    "$patterns = @('*bing*','*zune*','Microsoft.XboxApp','*solitaire*','*skypeapp*'); foreach ($p in $patterns) { Get-AppxPackage $p | Remove-AppxPackage -ErrorAction SilentlyContinue }",
  ),
], { timeoutMs: 180000 });

sequential("wifi-passwords", "Saved Wi-Fi networks", [
  ps(
    "List WLAN profile names",
    "netsh wlan show profiles | Select-String 'All User Profile' | ForEach-Object { ($_ -split ':',2)[1].Trim() }",
  ),
], { timeoutMs: 60000 });

sequential("disable-updates", "Disable Windows Update", [
  { label: "Stop wuauserv", file: "net.exe", args: ["stop", "wuauserv"] },
  { label: "Stop bits", file: "net.exe", args: ["stop", "bits"] },
  { label: "Disable wuauserv", file: "sc.exe", args: ["config", "wuauserv", "start=", "disabled"] },
  { label: "Disable bits", file: "sc.exe", args: ["config", "bits", "start=", "disabled"] },
  regAdd("No auto update", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "NoAutoUpdate", "REG_DWORD", "1"),
]);

sequential("enable-updates", "Enable Windows Update", [
  regAdd("wuauserv demand", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\wuauserv", "Start", "REG_DWORD", "3"),
  regAdd("bits auto", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\bits", "Start", "REG_DWORD", "2"),
  regDel("Clear no-auto policy", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\AU", "NoAutoUpdate"),
  { label: "Start wuauserv", file: "net.exe", args: ["start", "wuauserv"] },
  { label: "Start bits", file: "net.exe", args: ["start", "bits"] },
]);

function dnsPlan(id: string, title: string, script: string) {
  sequential(id, title, [
    ps(title, script),
    { label: "Flush DNS", file: "ipconfig.exe", args: ["/flushdns"] },
  ]);
}

dnsPlan("dns-cloudflare", "Cloudflare DNS", `${DNS} Set-DnsClientServerAddress -ServerAddresses ('1.1.1.1','1.0.0.1')`);
dnsPlan("dns-google", "Google DNS", `${DNS} Set-DnsClientServerAddress -ServerAddresses ('8.8.8.8','8.8.4.4')`);
dnsPlan("dns-quad9", "Quad9 DNS", `${DNS} Set-DnsClientServerAddress -ServerAddresses ('9.9.9.9','149.112.112.112')`);
dnsPlan("dns-adguard", "AdGuard DNS", `${DNS} Set-DnsClientServerAddress -ServerAddresses ('94.140.14.14','94.140.15.15')`);
dnsPlan("dns-default", "Automatic DNS", `${DNS} Set-DnsClientServerAddress -ResetServerAddresses`);

sequential("gamer-cache", "Game cache", [
  ps(
    "Clear launcher caches",
    "$paths = @(\"$env:APPDATA\\Discord\\Cache\",\"$env:LOCALAPPDATA\\Steam\\htmlcache\",\"$env:LOCALAPPDATA\\EpicGamesLauncher\\Saved\\webcache\",\"$env:LOCALAPPDATA\\Electronic Arts\\EA Desktop\\Cache\",\"$env:LOCALAPPDATA\\D3DSCache\"); foreach ($p in $paths) { if (Test-Path $p) { Remove-Item \"$p\\*\" -Recurse -Force -ErrorAction SilentlyContinue } }",
  ),
]);

sequential("oem-key", "OEM product key", [
  ps(
    "Read OA3 key",
    "$key = (Get-CimInstance SoftwareLicensingService).OA3xOriginalProductKey; if ($key -and $key.Length -ge 5) { 'An OEM key is present in firmware. Last five characters: ' + $key.Substring($key.Length - 5) } else { 'No OEM key in firmware.'; exit 2 }",
  ),
], { notes: ["Reads the firmware OEM key. It is not a retail license."] });

sequential("takeown-add", "Add Take Ownership", [
  regAdd("File verb", "HKCR\\*\\shell\\runas", "", "REG_SZ", "Take Ownership"),
  {
    label: "File command",
    file: "reg.exe",
    args: ["add", "HKCR\\*\\shell\\runas\\command", "/ve", "/d", "cmd.exe /c takeown /f \"%1\" && icacls \"%1\" /grant administrators:F /c /l & pause", "/f"],
  },
  regAdd("Folder verb", "HKCR\\Directory\\shell\\runas", "", "REG_SZ", "Take Ownership"),
  {
    label: "Folder command",
    file: "reg.exe",
    args: ["add", "HKCR\\Directory\\shell\\runas\\command", "/ve", "/d", "cmd.exe /c takeown /f \"%1\" /r /d y && icacls \"%1\" /grant administrators:F /t /c /l /q & pause", "/f"],
  },
]);

sequential("takeown-remove", "Remove Take Ownership", [
  regDel("File verb", "HKCR\\*\\shell\\runas"),
  regDel("Folder verb", "HKCR\\Directory\\shell\\runas"),
]);

sequential("bsod", "Crash log", [
  ps(
    "Recent bugchecks",
    "$e = Get-WinEvent -FilterHashtable @{LogName='System'; Id=1001} -MaxEvents 5 -ErrorAction SilentlyContinue; if (-not $e) { 'No recent bugcheck events.'; exit 0 }; $e | ForEach-Object { $_.TimeCreated.ToString('u') + ' ' + $_.Message }",
  ),
], { admin: false });

sequential("system-backup", "System image", [
  { label: "Start backup", file: "wbadmin.exe", args: ["start", "backup", "-backupTarget:{{drive}}:", "-include:C:", "-allCritical", "-quiet"] },
], { fields: ["drive"], timeoutMs: 900000 });

sequential("fw-block", "Block program", [
  { label: "Block outbound", file: "netsh.exe", args: ["advfirewall", "firewall", "add", "rule", "name=REcleaner_Block", "dir=out", "action=block", "program={{exePath}}"] },
  { label: "Block inbound", file: "netsh.exe", args: ["advfirewall", "firewall", "add", "rule", "name=REcleaner_Block", "dir=in", "action=block", "program={{exePath}}"] },
], { fields: ["exePath"] });

sequential("fw-unblock", "Unblock program", [
  { label: "Delete block rule", file: "netsh.exe", args: ["advfirewall", "firewall", "delete", "rule", "name=REcleaner_Block"] },
], { fields: ["exePath"] });

sequential("winupdate-repair", "Repair Windows Update", [
  { label: "Stop wuauserv", file: "net.exe", args: ["stop", "wuauserv"] },
  { label: "Stop bits", file: "net.exe", args: ["stop", "bits"] },
  { label: "Stop cryptsvc", file: "net.exe", args: ["stop", "cryptsvc"] },
  ps("Clear update cache", "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue 'C:\\Windows\\SoftwareDistribution','C:\\Windows\\System32\\catroot2'"),
  { label: "Start wuauserv", file: "net.exe", args: ["start", "wuauserv"] },
  { label: "Start bits", file: "net.exe", args: ["start", "bits"] },
  { label: "Start cryptsvc", file: "net.exe", args: ["start", "cryptsvc"] },
], { timeoutMs: 180000 });

sequential("store-repair", "Repair Store apps", [
  { label: "Reset Store cache", file: "wsreset.exe", args: [] },
  ps(
    "Re-register packages",
    "Get-AppxPackage -AllUsers | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register (Join-Path $_.InstallLocation 'AppXManifest.xml') -ErrorAction SilentlyContinue }",
  ),
], { timeoutMs: 300000 });

sequential("icons-rebuild", "Rebuild icons", [
  ps(
    "Clear icon caches",
    "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Remove-Item -Force -ErrorAction SilentlyContinue \"$env:LOCALAPPDATA\\IconCache.db\"; Remove-Item -Force -ErrorAction SilentlyContinue \"$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache_*.db\", \"$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\thumbcache_*.db\"; Start-Process explorer.exe",
  ),
]);

sequential("taskbar-repair", "Repair shell", [
  ps(
    "Restart shell",
    "Stop-Process -Name explorer,SearchApp,SearchUI -Force -ErrorAction SilentlyContinue; Get-AppxPackage Microsoft.Windows.ShellExperienceHost | ForEach-Object { Add-AppxPackage -DisableDevelopmentMode -Register (Join-Path $_.InstallLocation 'AppXManifest.xml') -ErrorAction SilentlyContinue }; Start-Process explorer.exe",
  ),
]);

sequential("fix-audio", "Restart audio", [
  { label: "Stop audio", file: "net.exe", args: ["stop", "audiosrv"] },
  { label: "Stop endpoint builder", file: "net.exe", args: ["stop", "AudioEndpointBuilder"] },
  { label: "Start endpoint builder", file: "net.exe", args: ["start", "AudioEndpointBuilder"] },
  { label: "Start audio", file: "net.exe", args: ["start", "audiosrv"] },
]);

sequential("fix-bluetooth", "Restart Bluetooth", [
  { label: "Stop bthserv", file: "net.exe", args: ["stop", "bthserv"] },
  { label: "Start bthserv", file: "net.exe", args: ["start", "bthserv"] },
]);

sequential("fix-printer", "Clear print queue", [
  { label: "Stop spooler", file: "net.exe", args: ["stop", "spooler"] },
  ps("Clear queue", "Remove-Item -Force -ErrorAction SilentlyContinue \"$env:SystemRoot\\System32\\Spool\\Printers\\*.*\""),
  { label: "Start spooler", file: "net.exe", args: ["start", "spooler"] },
]);

sequential("restart-core", "Restart core services", [
  { label: "Stop wuauserv", file: "net.exe", args: ["stop", "wuauserv"] },
  { label: "Start wuauserv", file: "net.exe", args: ["start", "wuauserv"] },
  { label: "Stop bits", file: "net.exe", args: ["stop", "bits"] },
  { label: "Start bits", file: "net.exe", args: ["start", "bits"] },
  { label: "Stop cryptsvc", file: "net.exe", args: ["stop", "cryptsvc"] },
  { label: "Start cryptsvc", file: "net.exe", args: ["start", "cryptsvc"] },
]);

sequential("quick-scan", "Defender quick scan", [
  { label: "Quick scan", file: "C:\\Program Files\\Windows Defender\\MpCmdRun.exe", args: ["-Scan", "-ScanType", "1"] },
], { timeoutMs: 600000, notes: ["Uses Windows Defender MpCmdRun. A missing binary is reported, not treated as a clean scan."] });

sequential("full-scan", "Defender full scan", [
  { label: "Full scan", file: "C:\\Program Files\\Windows Defender\\MpCmdRun.exe", args: ["-Scan", "-ScanType", "2"] },
], { timeoutMs: 1200000 });

sequential("offline-scan", "Defender offline scan", [
  ps("Start offline scan", "Start-MpWDOScan"),
]);

sequential("defender-history", "Clear Defender history", [
  ps(
    "Clear detection history",
    "Remove-Item -Recurse -Force -ErrorAction SilentlyContinue 'C:\\ProgramData\\Microsoft\\Windows Defender\\Scans\\History\\Service\\*'",
  ),
]);

sequential("defender-repair", "Repair Defender", [
  regDel("Remove Defender policy", "HKLM\\Software\\Policies\\Microsoft\\Windows Defender"),
  { label: "Automatic start", file: "sc.exe", args: ["config", "WinDefend", "start=", "auto"] },
  { label: "Start WinDefend", file: "net.exe", args: ["start", "WinDefend"] },
  { label: "Signature update", file: "C:\\Program Files\\Windows Defender\\MpCmdRun.exe", args: ["-SignatureUpdate"] },
]);

sequential("firewall-reset", "Reset firewall", [
  { label: "Reset firewall", file: "netsh.exe", args: ["advfirewall", "reset"] },
]);

sequential("hosts-reset", "Reset hosts file", [
  ps(
    "Write default hosts",
    "$p = Join-Path $env:SystemRoot 'System32\\drivers\\etc\\hosts'; Copy-Item $p ($p + '.recleaner.bak') -Force -ErrorAction SilentlyContinue; @('# Copyright (c) 1993-2009 Microsoft Corp.','127.0.0.1 localhost','::1 localhost') | Set-Content $p -Encoding ascii",
  ),
]);

sequential("telemetry-off", "Disable telemetry", [
  regAdd("AllowTelemetry", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", "REG_DWORD", "0"),
  { label: "Disable DiagTrack", file: "sc.exe", args: ["config", "DiagTrack", "start=", "disabled"] },
  { label: "Stop DiagTrack", file: "sc.exe", args: ["stop", "DiagTrack"] },
]);

sequential("telemetry-on", "Enable telemetry", [
  regAdd("AllowTelemetry", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection", "AllowTelemetry", "REG_DWORD", "1"),
  { label: "Enable DiagTrack", file: "sc.exe", args: ["config", "DiagTrack", "start=", "auto"] },
  { label: "Start DiagTrack", file: "net.exe", args: ["start", "DiagTrack"] },
]);

sequential("driver-backup", "Backup drivers", [
  ps(
    "Export drivers",
    "$dest = '{{drive}}:\\Drivers_Backup'; New-Item -ItemType Directory -Force -Path $dest | Out-Null; dism /online /export-driver /destination:$dest",
  ),
], { fields: ["drive"], timeoutMs: 300000 });

sequential("driver-restore", "Restore drivers", [
  { label: "Install backed up drivers", file: "pnputil.exe", args: ["/add-driver", "{{drive}}:\\Drivers_Backup\\*.inf", "/subdirs", "/install"] },
], { fields: ["drive"], timeoutMs: 600000 });

sequential("driver-delete", "Remove driver", [
  { label: "Delete driver", file: "pnputil.exe", args: ["/delete-driver", "{{publishedName}}", "/uninstall", "/force"] },
], { fields: ["publishedName"] });

sequential("driver-list", "List third-party drivers", [
  { label: "Enumerate drivers", file: "pnputil.exe", args: ["/enum-drivers"] },
], { timeoutMs: 60000, admin: false });

function wingetInstall(id: string, title: string, pkg: string) {
  sequential(id, title, [
    {
      label: `Install ${pkg}`,
      file: "winget.exe",
      args: ["install", "--id", pkg, "--exact", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity", "--source", "winget"],
    },
  ], { timeoutMs: 600000, notes: [`winget install --id ${pkg}`] });
}

export const APP_PACKAGES: { id: string; title: string; pkg: string }[] = [
  { id: "app-chrome", title: "Google Chrome", pkg: "Google.Chrome" },
  { id: "app-firefox", title: "Mozilla Firefox", pkg: "Mozilla.Firefox" },
  { id: "app-brave", title: "Brave", pkg: "Brave.Brave" },
  { id: "app-discord", title: "Discord", pkg: "Discord.Discord" },
  { id: "app-zoom", title: "Zoom", pkg: "Zoom.Zoom" },
  { id: "app-7zip", title: "7-Zip", pkg: "7zip.7zip" },
  { id: "app-vlc", title: "VLC", pkg: "VideoLAN.VLC" },
  { id: "app-steam", title: "Steam", pkg: "Valve.Steam" },
  { id: "app-obs", title: "OBS Studio", pkg: "OBSProject.OBSStudio" },
];

for (const app of APP_PACKAGES) wingetInstall(app.id, app.title, app.pkg);

const RUNTIMES = [
  "Microsoft.VCRedist.2015+.x64",
  "Microsoft.VCRedist.2015+.x86",
  "Microsoft.DotNet.DesktopRuntime.8",
  "Microsoft.EdgeWebView2Runtime",
  "Microsoft.DirectX",
];

sequential("install-runtimes", "Core runtimes", RUNTIMES.map((pkg) => ({
  label: pkg,
  file: "winget.exe",
  args: ["install", "--id", pkg, "--exact", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity", "--source", "winget"],
})), { timeoutMs: 900000 });

sequential("winget-upgrade", "Check app updates", [
  { label: "winget upgrade", file: "winget.exe", args: ["upgrade", "--source", "winget", "--include-unknown"] },
], { timeoutMs: 180000, admin: false });

sequential("winget-upgrade-all", "Update all apps", [
  {
    label: "winget upgrade --all",
    file: "winget.exe",
    args: ["upgrade", "--all", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--disable-interactivity", "--source", "winget"],
  },
], { timeoutMs: 900000 });

sequential("winget-upgrade-one", "Update one app", [
  {
    label: "Upgrade package",
    file: "winget.exe",
    args: ["upgrade", "--id", "{{packageId}}", "--exact", "--silent", "--accept-source-agreements", "--accept-package-agreements", "--source", "winget"],
  },
], { fields: ["packageId"], timeoutMs: 600000 });

sequential("winget-uninstall", "Uninstall app", [
  { label: "Uninstall", file: "winget.exe", args: ["uninstall", "--id", "{{packageId}}", "--exact", "--silent", "--purge"] },
], { fields: ["packageId"], timeoutMs: 300000 });

sequential("winget-search", "Search apps", [
  { label: "Search", file: "winget.exe", args: ["search", "--query", "{{packageId}}", "--source", "winget"] },
], { fields: ["packageId"], timeoutMs: 120000, admin: false });

sequential("winget-export", "Export app list", [
  ps(
    "Export",
    "$dir = '{{drive}}:\\REcleaner'; New-Item -ItemType Directory -Force $dir | Out-Null; winget export -o (Join-Path $dir 'apps.json') --accept-source-agreements",
  ),
], { fields: ["drive"], timeoutMs: 180000 });

sequential("winget-import", "Import app list", [
  { label: "Import", file: "winget.exe", args: ["import", "-i", "{{drive}}:\\REcleaner\\apps.json", "--accept-source-agreements", "--accept-package-agreements"] },
], { fields: ["drive"], timeoutMs: 900000 });

function opener(id: string, title: string, target: string) {
  sequential(id, title, [ps(`Open ${title}`, `Start-Process '${target.replace(/'/g, "")}'`)], {
    admin: false,
    timeoutMs: 20000,
  });
}

export const OPENERS: [string, string, string][] = [
  ["open-taskmgr", "Task Manager", "taskmgr"],
  ["open-services", "Services", "services.msc"],
  ["open-devices", "Device Manager", "devmgmt.msc"],
  ["open-cleanmgr", "Disk Cleanup", "cleanmgr"],
  ["open-msconfig", "System Configuration", "msconfig"],
  ["open-regedit", "Registry Editor", "regedit"],
  ["open-resmon", "Resource Monitor", "resmon"],
  ["open-eventvwr", "Event Viewer", "eventvwr.msc"],
  ["open-apps", "Installed apps", "appwiz.cpl"],
  ["open-sysinfo", "System Information", "msinfo32"],
  ["open-dxdiag", "DirectX Diagnostic", "dxdiag"],
  ["open-diskmgmt", "Disk Management", "diskmgmt.msc"],
  ["open-compmgmt", "Computer Management", "compmgmt.msc"],
  ["open-gpedit", "Group Policy", "gpedit.msc"],
  ["open-power", "Power Options", "powercfg.cpl"],
  ["open-sound", "Sound", "mmsys.cpl"],
  ["open-ncpa", "Network Connections", "ncpa.cpl"],
  ["open-tasks", "Task Scheduler", "taskschd.msc"],
  ["open-firewall", "Firewall", "wf.msc"],
  ["open-users", "Local Users", "lusrmgr.msc"],
  ["open-perfmon", "Performance Monitor", "perfmon.msc"],
];

for (const [id, title, target] of OPENERS) opener(id, title, target);

function probe(id: string, title: string, notes: string[], extra?: { admin?: boolean; timeoutMs?: number }) {
  add({
    id,
    title,
    windowsOnly: true,
    admin: extra?.admin ?? false,
    timeoutMs: extra?.timeoutMs ?? 60000,
    kind: "probe",
    notes,
  });
}

probe("win-info", "Windows version", ["Read Windows NT CurrentVersion. No changes."], { timeoutMs: 20000 });
probe("wu-diagnose", "Windows Update diagnostic", ["Read update services, reboot-pending flags, and recent update-client errors. No reset."]);
probe("defender-status", "Defender status", ["Get-MpComputerStatus. Does not change protection."]);
probe("firewall-status", "Firewall status", ["netsh advfirewall show allprofiles state. Does not enable or reset the firewall."], { timeoutMs: 30000 });
probe("disk-diagnose", "Disk diagnostic", ["Physical disk health, free space, and a measured size of temp files. Deletes nothing."], { timeoutMs: 180000 });
probe("network-diagnose", "Network diagnostic", ["Adapter, gateway, DNS, and HTTPS to www.microsoft.com. Does not reset the stack."]);
probe("winget-diagnose", "WinGet diagnostic", ["winget --version and winget source list. Does not install or remove packages."]);
probe("events-diagnose", "Event diagnostic", ["Counts recent System and Application events. Caps each query at 200. Clears nothing."], { timeoutMs: 90000 });
probe("bsod-diagnose", "Crash diagnostic", ["Minidump presence and one recent bugcheck event. Does not claim a cause."], { timeoutMs: 45000 });
probe("wmi-diagnose", "WMI diagnostic", ["Win32_OperatingSystem and winmgmt /verifyrepository. Does not rebuild the repository."]);
probe("shell-diagnose", "Shell diagnostic", ["Whether Explorer is running. Does not restart it."], { timeoutMs: 30000 });
probe("startup-diagnose", "Startup diagnostic", ["Lists Win32_StartupCommand. Disables nothing."], { timeoutMs: 30000 });
probe("wu-repair", "Windows Update repair", [
  "Stops BITS, Windows Update, Cryptographic Services, and the installer service.",
  "Renames SoftwareDistribution and catroot2. Does not delete them.",
  "Starts the services again and checks that Windows Update and BITS are running.",
], { admin: true, timeoutMs: 180000 });

add({
  id: "dism-check",
  title: "Image diagnostic",
  windowsOnly: true,
  admin: true,
  timeoutMs: 900000,
  kind: "dism-check",
  notes: [
    "DISM /Online /Cleanup-Image /CheckHealth",
    "Repair-WindowsImage -Online -CheckHealth",
    "DISM /Online /Cleanup-Image /ScanHealth — only when CheckHealth is not conclusive",
    "RestoreHealth is not started by this diagnostic",
  ],
});

add({
  id: "sfc-verify",
  title: "System file diagnostic",
  windowsOnly: true,
  admin: true,
  timeoutMs: 900000,
  kind: "sfc-verify",
  notes: ["sfc /verifyonly. sfc /scannow is not started by this diagnostic."],
});

add({
  id: "open-security",
  title: "Open Windows Security",
  windowsOnly: true,
  admin: false,
  timeoutMs: 15000,
  steps: [ps("Open Windows Security", "Start-Process windowsdefender:")],
  notes: ["Opens Windows Security. Does not change protection settings."],
});

sequential("dns-flush", "Flush DNS", [
  { label: "Flush DNS", file: "ipconfig.exe", args: ["/flushdns"] },
], { admin: false, timeoutMs: 20000, notes: ["ipconfig /flushdns. Does not reset Winsock or TCP/IP."] });

sequential("firewall-enable", "Enable firewall", [
  { label: "Enable all profiles", file: "netsh.exe", args: ["advfirewall", "set", "allprofiles", "state", "on"] },
], { notes: ["Turns every firewall profile on. Does not reset firewall rules."] });

sequential("user-add", "Create account", [
  { label: "Create user", file: "net.exe", args: ["user", "{{user}}", "{{password}}", "/add"] },
], { fields: ["user", "password"], optional: ["password"] });

sequential("user-delete", "Delete account", [
  { label: "Delete user", file: "net.exe", args: ["user", "{{user}}", "/delete"] },
], { fields: ["user"] });

sequential("user-rename", "Rename account", [
  ps("Rename", "Rename-LocalUser -Name '{{user}}' -NewName '{{newName}}'"),
], { fields: ["user", "newName"] });

sequential("user-password", "Change password", [
  { label: "Set password", file: "net.exe", args: ["user", "{{user}}", "{{password}}"] },
], { fields: ["user", "password"], optional: ["password"] });

sequential("user-grant", "Grant administrator", [
  ps(
    "Add to administrators",
    "$g = (Get-LocalGroup | Where-Object { $_.SID -eq 'S-1-5-32-544' }).Name; net localgroup $g '{{user}}' /add",
  ),
], { fields: ["user"] });

sequential("user-revoke", "Revoke administrator", [
  ps(
    "Remove from administrators",
    "$g = (Get-LocalGroup | Where-Object { $_.SID -eq 'S-1-5-32-544' }).Name; net localgroup $g '{{user}}' /delete",
  ),
], { fields: ["user"] });

sequential("user-hide", "Hide account", [
  regAdd("Hide from sign-in", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\SpecialAccounts\\UserList", "{{user}}", "REG_DWORD", "0"),
], { fields: ["user"] });

sequential("user-show", "Show account", [
  regDel("Show on sign-in", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\SpecialAccounts\\UserList", "{{user}}"),
], { fields: ["user"] });

sequential("user-disable", "Disable account", [
  { label: "Disable", file: "net.exe", args: ["user", "{{user}}", "/active:no"] },
], { fields: ["user"] });

sequential("user-enable", "Enable account", [
  { label: "Enable", file: "net.exe", args: ["user", "{{user}}", "/active:yes"] },
], { fields: ["user"] });

sequential("builtin-admin-on", "Enable built-in administrator", [
  ps("Enable SID 500", "$n = (Get-LocalUser | Where-Object { $_.SID -like '*-500' }).Name; if (-not $n) { exit 1 }; net user $n /active:yes"),
]);

sequential("builtin-admin-off", "Disable built-in administrator", [
  ps("Disable SID 500", "$n = (Get-LocalUser | Where-Object { $_.SID -like '*-500' }).Name; if (-not $n) { exit 1 }; net user $n /active:no"),
]);

sequential("user-info", "Account details", [
  { label: "net user", file: "net.exe", args: ["user", "{{user}}"] },
], { fields: ["user"], admin: false });

const TWEAK_STEPS: Record<string, Step[]> = {
  "tweak-delay": [regAdd("Menu show delay", "HKCU\\Control Panel\\Desktop", "MenuShowDelay", "REG_SZ", "10")],
  "tweak-menu": [
    regAdd("Classic menu", "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32", "", "REG_SZ", ""),
    ps("Restart Explorer", "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Process explorer"),
  ],
  "tweak-lock": [regAdd("No lock screen", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization", "NoLockScreen", "REG_DWORD", "1")],
  "tweak-visual": [regAdd("Visual effects", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", "VisualFXSetting", "REG_DWORD", "2")],
  "tweak-sticky": [
    regAdd("Sticky keys", "HKCU\\Control Panel\\Accessibility\\StickyKeys", "Flags", "REG_SZ", "506"),
    regAdd("Filter keys", "HKCU\\Control Panel\\Accessibility\\Keyboard Response", "Flags", "REG_SZ", "122"),
  ],
  "tweak-network": [
    regAdd("Throttling", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile", "NetworkThrottlingIndex", "REG_DWORD", "4294967295"),
    regAdd("Responsiveness", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile", "SystemResponsiveness", "REG_DWORD", "0"),
  ],
  "tweak-bing": [
    regAdd("Search suggestions", "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer", "DisableSearchBoxSuggestions", "REG_DWORD", "1"),
    regAdd("Bing search", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search", "BingSearchEnabled", "REG_DWORD", "0"),
  ],
  "tweak-sysmain": [
    { label: "Disable SysMain", file: "sc.exe", args: ["config", "SysMain", "start=", "disabled"] },
    { label: "Stop SysMain", file: "net.exe", args: ["stop", "SysMain"] },
  ],
  "tweak-dvr": [
    regAdd("Game DVR", "HKCU\\System\\GameConfigStore", "GameDVR_Enabled", "REG_DWORD", "0"),
    regAdd("Allow Game DVR", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR", "AllowGameDVR", "REG_DWORD", "0"),
  ],
  "tweak-mouse": [
    regAdd("MouseSpeed", "HKCU\\Control Panel\\Mouse", "MouseSpeed", "REG_SZ", "0"),
    regAdd("Threshold 1", "HKCU\\Control Panel\\Mouse", "MouseThreshold1", "REG_SZ", "0"),
    regAdd("Threshold 2", "HKCU\\Control Panel\\Mouse", "MouseThreshold2", "REG_SZ", "0"),
  ],
  "tweak-hibernate": [{ label: "Hibernate off", file: "powercfg.exe", args: ["/hibernate", "off"] }],
  "tweak-vbs": [
    regAdd("Memory integrity", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity", "Enabled", "REG_DWORD", "0"),
    regAdd("VBS", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard", "EnableVirtualizationBasedSecurity", "REG_DWORD", "0"),
  ],
  "tweak-p2p": [
    regAdd("Delivery mode", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization", "DODownloadMode", "REG_DWORD", "0"),
  ],
};

const TWEAK_TITLES: Record<string, string> = {
  "tweak-delay": "Menu delay",
  "tweak-menu": "Classic context menu",
  "tweak-lock": "Lock screen",
  "tweak-visual": "Visual effects",
  "tweak-sticky": "Sticky keys",
  "tweak-network": "Network throttling",
  "tweak-bing": "Bing search",
  "tweak-sysmain": "SysMain",
  "tweak-dvr": "Game DVR",
  "tweak-mouse": "Mouse acceleration",
  "tweak-hibernate": "Hibernation",
  "tweak-vbs": "Memory integrity",
  "tweak-p2p": "Peer-to-peer updates",
};

for (const [id, steps] of Object.entries(TWEAK_STEPS)) {
  sequential(id, TWEAK_TITLES[id] ?? id, steps);
}

sequential("tweak-all", "Apply listed tweaks", Object.values(TWEAK_STEPS).flat(), { timeoutMs: 180000 });

sequential("tweak-restore", "Restore tweak defaults", [
  regAdd("Menu delay", "HKCU\\Control Panel\\Desktop", "MenuShowDelay", "REG_SZ", "400"),
  regDel("Classic menu", "HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}"),
  regDel("Lock screen", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization", "NoLockScreen"),
  regAdd("Visual effects", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", "VisualFXSetting", "REG_DWORD", "0"),
  regAdd("Sticky keys", "HKCU\\Control Panel\\Accessibility\\StickyKeys", "Flags", "REG_SZ", "510"),
  regAdd("Throttling", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile", "NetworkThrottlingIndex", "REG_DWORD", "10"),
  regAdd("Responsiveness", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile", "SystemResponsiveness", "REG_DWORD", "20"),
  regDel("Bing policy", "HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer", "DisableSearchBoxSuggestions"),
  { label: "SysMain automatic", file: "sc.exe", args: ["config", "SysMain", "start=", "auto"] },
  { label: "Start SysMain", file: "net.exe", args: ["start", "SysMain"] },
  regAdd("Game DVR", "HKCU\\System\\GameConfigStore", "GameDVR_Enabled", "REG_DWORD", "1"),
  regAdd("MouseSpeed", "HKCU\\Control Panel\\Mouse", "MouseSpeed", "REG_SZ", "1"),
  { label: "Hibernate on", file: "powercfg.exe", args: ["/hibernate", "on"] },
  regAdd("Memory integrity", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity", "Enabled", "REG_DWORD", "1"),
  regDel("Delivery policy", "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization", "DODownloadMode"),
  { label: "Balanced plan", file: "powercfg.exe", args: ["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"] },
  ps("Restart Explorer", "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Process explorer"),
], { timeoutMs: 180000 });

sequential("win-activate", "Activate Windows", [
  { label: "Install key", file: "cscript.exe", args: ["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/ipk", "{{productKey}}"] },
  { label: "Activate", file: "cscript.exe", args: ["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/ato"] },
], { fields: ["productKey"], timeoutMs: 180000 });

sequential("win-remove-key", "Remove Windows key", [
  { label: "Uninstall key", file: "cscript.exe", args: ["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/upk"] },
  { label: "Clear key from registry", file: "cscript.exe", args: ["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/cpky"] },
]);

sequential("win-status", "Windows license status", [
  { label: "License details", file: "cscript.exe", args: ["//nologo", "C:\\Windows\\System32\\slmgr.vbs", "/dlv"] },
], { timeoutMs: 60000 });

sequential("office-status", "Office license status", [
  ps(
    "OSPP status",
    "$c = @(\"$env:ProgramFiles\\Microsoft Office\\root\\Office16\\OSPP.VBS\",\"${env:ProgramFiles(x86)}\\Microsoft Office\\root\\Office16\\OSPP.VBS\", \"$env:ProgramFiles\\Microsoft Office\\Office16\\OSPP.VBS\") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; if (-not $c) { 'OSPP.VBS was not found. Microsoft 365 subscription licensing is managed inside Office.'; exit 2 }; cscript //nologo $c /dstatus",
  ),
], { timeoutMs: 60000 });

sequential("office-activate", "Activate Office", [
  ps(
    "Install and activate a volume key",
    "$key = '{{productKey}}'; $c = @(\"$env:ProgramFiles\\Microsoft Office\\root\\Office16\\OSPP.VBS\",\"${env:ProgramFiles(x86)}\\Microsoft Office\\root\\Office16\\OSPP.VBS\") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; if (-not $c) { 'OSPP.VBS was not found.'; exit 2 }; cscript //nologo $c /inpkey:$key; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; cscript //nologo $c /act; exit $LASTEXITCODE",
  ),
], { fields: ["productKey"], timeoutMs: 180000 });

sequential("office-remove-key", "Remove Office keys", [
  ps(
    "Uninstall detected Office keys",
    "$c = @(\"$env:ProgramFiles\\Microsoft Office\\root\\Office16\\OSPP.VBS\",\"${env:ProgramFiles(x86)}\\Microsoft Office\\root\\Office16\\OSPP.VBS\") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1; if (-not $c) { 'OSPP.VBS was not found.'; exit 2 }; $out = cscript //nologo $c /dstatus | Out-String; $out; $keys = [regex]::Matches($out, 'Last 5 characters of installed product key:\\s*(\\w{5})'); if ($keys.Count -eq 0) { 'No installed key suffix was detected.'; exit 2 }; foreach ($m in $keys) { cscript //nologo $c /unpkey:$($m.Groups[1].Value) }",
  ),
], { timeoutMs: 120000 });

export function getPlan(id: string): Plan | undefined {
  return PLANS[id];
}

export function planIds(): string[] {
  return Object.keys(PLANS);
}

export function commandPreview(plan: Plan): string[] {
  if (plan.notes?.length) return plan.notes;
  return (plan.steps ?? []).map((step) => {
    const args = step.args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ");
    return args ? `${step.file} ${args}` : step.file;
  });
}

const KEY_RE = /^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){4}$/;
const USER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
const PKG_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,80}$/;
const EXE_RE = /^[A-Za-z]:\\(?:[^<>:"|?*\r\n\\]+\\)*[^<>:"|?*\r\n\\]+\.exe$/i;
const OEM_RE = /^oem\d+\.inf$/i;

export function validateField(field: FieldKey, raw: string, optional: boolean): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value && optional) return { ok: true, value: "" };
  if (!value) return { ok: false, message: `${FIELD_META[field].label} is required.` };
  if (field === "drive") {
    const d = value.replace(":", "").toUpperCase();
    if (!/^[A-Z]$/.test(d)) return { ok: false, message: "Enter one drive letter." };
    return { ok: true, value: d };
  }
  if (field === "minutes") {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 720) return { ok: false, message: "Enter minutes from 1 to 720." };
    return { ok: true, value: String(n) };
  }
  if (field === "user" || field === "newName") {
    if (!USER_RE.test(value)) return { ok: false, message: "Use a short username without spaces." };
    return { ok: true, value };
  }
  if (field === "password") {
    if (value.length > 64 || /[\r\n\0]/.test(value)) return { ok: false, message: "That password cannot be used." };
    return { ok: true, value };
  }
  if (field === "packageId") {
    if (!PKG_RE.test(value)) return { ok: false, message: "Enter a package id such as Google.Chrome." };
    return { ok: true, value };
  }
  if (field === "productKey") {
    if (!KEY_RE.test(value)) return { ok: false, message: "Enter a key in the form XXXXX-XXXXX-XXXXX-XXXXX-XXXXX." };
    return { ok: true, value: value.toUpperCase() };
  }
  if (field === "exePath") {
    if (!EXE_RE.test(value)) return { ok: false, message: "Enter a full path to an .exe file." };
    return { ok: true, value };
  }
  if (field === "publishedName") {
    if (!OEM_RE.test(value)) return { ok: false, message: "Enter a published name such as oem12.inf." };
    return { ok: true, value: value.toLowerCase() };
  }
  if (field === "edition") {
    if (!EDITIONS.some((e) => e.value === value)) return { ok: false, message: "Choose a listed edition." };
    return { ok: true, value };
  }
  return { ok: false, message: "Unknown field." };
}

export function applyTokens(steps: Step[], values: Record<string, string>): Step[] {
  return steps.map((step) => ({
    label: step.label,
    file: step.file,
    args: step.args.map((arg) => arg.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "")),
  }));
}

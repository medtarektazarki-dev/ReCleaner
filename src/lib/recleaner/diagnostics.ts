export const PROBE_SCRIPT: Record<string, string> = {
  "win-info": `
$cv = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'
$build = 0
[void][int]::TryParse([string]$cv.CurrentBuild, [ref]$build)
$ubr = $cv.UBR
$display = [string]$cv.DisplayVersion
$product = [string]$cv.ProductName
$edition = [string]$cv.EditionID
$arch = [string]$env:PROCESSOR_ARCHITECTURE
"PRODUCT=$product"
"EDITION=$edition"
"BUILD=$build"
"UBR=$ubr"
"DISPLAY=$display"
"ARCH=$arch"
if ($build -ge 22000) {
  "WINDOWS11=yes"
  "GRADE=healthy"
  "SUMMARY=Windows 11 $product, edition $edition, build $build.$ubr $display, $arch. Nothing was changed."
} elseif ($build -gt 0) {
  "WINDOWS11=no"
  "GRADE=critical"
  "SUMMARY=This PC is not Windows 11 (build $build). REcleaner does not treat it as a supported Windows 11 system."
} else {
  "WINDOWS11=no"
  "GRADE=unknown"
  "SUMMARY=The Windows build number could not be read."
}
`.trim(),

  "wu-diagnose": `
$names = 'wuauserv','bits','cryptsvc','usosvc'
$bad = 0
foreach ($n in $names) {
  $s = Get-Service -Name $n -ErrorAction SilentlyContinue
  if (-not $s) { "SVC=$n|missing"; $bad++; continue }
  "SVC=$n|$($s.Status)|$($s.StartType)"
  if ($s.StartType -eq 'Disabled' -or ($s.Status -ne 'Running' -and $s.StartType -eq 'Automatic')) { $bad++ }
}
$pending = (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending') -or (Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired')
"REBOOT_PENDING=$pending"
$errs = @(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-WindowsUpdateClient'; Level=2; StartTime=(Get-Date).AddDays(-7) } -MaxEvents 30 -ErrorAction SilentlyContinue).Count
"UPDATE_ERRORS=$errs"
if ($bad -gt 0) {
  "GRADE=warning"
  "SUMMARY=An update-related service is stopped or disabled. Components were not reset."
  "REPAIR=wu-repair"
} elseif ($errs -gt 0) {
  "GRADE=attention"
  "SUMMARY=Windows Update recorded errors in the newest events examined (7 days, capped at 30). Components were not reset."
  "REPAIR=wu-repair"
} elseif ($pending) {
  "GRADE=attention"
  "SUMMARY=A reboot is pending for Windows servicing. No update reset was performed."
} else {
  "GRADE=healthy"
  "SUMMARY=Update services responded and no examined update errors were found. No reset was performed."
}
`.trim(),

  "defender-status": `
try {
  $s = Get-MpComputerStatus -ErrorAction Stop
  "RTP=$($s.RealTimeProtectionEnabled)"
  "AV=$($s.AntivirusEnabled)"
  "SIG=$($s.AntivirusSignatureLastUpdated)"
  if ($s.RealTimeProtectionEnabled -and $s.AntivirusEnabled) {
    "GRADE=healthy"
    "SUMMARY=Microsoft Defender real-time protection is on. Settings were not changed."
  } else {
    "GRADE=attention"
    "SUMMARY=Microsoft Defender real-time protection or antivirus is not on. Settings were not changed."
  }
} catch {
  "GRADE=unknown"
  "SUMMARY=Defender status could not be read. Settings were not changed."
  "DETAIL=$($_.Exception.Message)"
}
`.trim(),

  "firewall-status": `
$out = netsh advfirewall show allprofiles state | Out-String
$out
$on = ([regex]::Matches($out, 'State\\s+ON')).Count
$off = ([regex]::Matches($out, 'State\\s+OFF')).Count
"ON=$on"
"OFF=$off"
if ($on -ge 1 -and $off -eq 0) {
  "GRADE=healthy"
  "SUMMARY=Reported firewall profiles are on. Nothing was changed."
} elseif ($on -eq 0 -and $off -ge 1) {
  "GRADE=critical"
  "SUMMARY=Firewall profiles are off. REcleaner did not enable them."
} elseif ($off -ge 1) {
  "GRADE=attention"
  "SUMMARY=At least one firewall profile is off. REcleaner did not enable it."
} else {
  "GRADE=unknown"
  "SUMMARY=Firewall state could not be read. Nothing was changed."
}
`.trim(),

  "disk-diagnose": `
$letter = $env:SystemDrive.Substring(0,1)
$drive = Get-PSDrive -Name $letter
$free = [int64]$drive.Free
$used = [int64]$drive.Used
$cap = $free + $used
"FREE_BYTES=$free"
"CAPACITY_BYTES=$cap"
function Measure-Tree([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return [int64]0 }
  $sum = (Get-ChildItem -LiteralPath $path -Force -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
  if (-not $sum) { return [int64]0 }
  return [int64]$sum
}
$temp = (Measure-Tree "$env:SystemRoot\\Temp") + (Measure-Tree $env:TEMP) + (Measure-Tree "$env:LOCALAPPDATA\\Temp") + (Measure-Tree "$env:LOCALAPPDATA\\Microsoft\\Windows\\INetCache")
"TEMP_BYTES=$temp"
$bad = 0
try {
  $disks = @(Get-PhysicalDisk -ErrorAction Stop)
  foreach ($disk in $disks) {
    "DISK=$($disk.FriendlyName)|$($disk.HealthStatus)|$($disk.OperationalStatus)"
    if ($disk.HealthStatus -and [string]$disk.HealthStatus -ne 'Healthy') { $bad++ }
  }
  "DISK_BAD=$bad"
} catch {
  "DISK_BAD=unknown"
  "DETAIL=$($_.Exception.Message)"
}
$low = ($cap -gt 0 -and (($free / $cap) -lt 0.10))
if ($bad -gt 0) {
  "GRADE=critical"
  "SUMMARY=A physical disk did not report Healthy. Nothing was deleted."
} elseif ($low) {
  "GRADE=warning"
  "SUMMARY=Free space on $letter is under 10 percent. Nothing was deleted."
  if ($temp -ge 209715200) { "REPAIR=clean-temp" }
} elseif ($temp -ge 209715200) {
  "GRADE=attention"
  "SUMMARY=Temporary files were measured. Nothing was deleted."
  "REPAIR=clean-temp"
} else {
  "GRADE=healthy"
  "SUMMARY=Measured disks reported Healthy and free space is not under 10 percent. Nothing was deleted."
}
`.trim(),

  "network-diagnose": `
$up = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
"ADAPTERS_UP=$($up.Count)"
$gw = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($gw) { "GATEWAY=$($gw.NextHop)" } else { "GATEWAY=" }
$dnsOk = $false
try {
  $resolved = Resolve-DnsName 'www.microsoft.com' -ErrorAction Stop | Select-Object -First 1
  if ($resolved) { $dnsOk = $true }
} catch {}
"DNS_OK=$dnsOk"
$inet = $false
if ($dnsOk) {
  try {
    $test = Test-NetConnection 'www.microsoft.com' -Port 443 -WarningAction SilentlyContinue
    $inet = [bool]$test.TcpTestSucceeded
  } catch {}
}
"INTERNET=$inet"
if ($up.Count -eq 0) {
  "GRADE=warning"
  "SUMMARY=No network adapter is up. Networking was not reset."
} elseif (-not $gw) {
  "GRADE=warning"
  "SUMMARY=No default gateway was found. Networking was not reset."
} elseif (-not $dnsOk) {
  "GRADE=attention"
  "SUMMARY=DNS lookup of www.microsoft.com failed. The DNS cache was not flushed."
  "REPAIR=dns-flush"
} elseif (-not $inet) {
  "GRADE=attention"
  "SUMMARY=DNS worked, but HTTPS to www.microsoft.com did not. Local checks still ran. Networking was not reset."
} else {
  "GRADE=healthy"
  "SUMMARY=An adapter is up, a gateway exists, and HTTPS to www.microsoft.com succeeded."
}
`.trim(),

  "winget-diagnose": `
$version = & winget --version 2>&1 | Out-String
"VERSION=$($version.Trim())"
if (-not $version.Trim()) {
  "GRADE=attention"
  "SUMMARY=WinGet did not return a version. Packages were not changed."
  exit 0
}
$sources = & winget source list 2>&1 | Out-String
"SOURCES=$($sources.Trim())"
if ($sources -match 'winget') {
  "GRADE=healthy"
  "SUMMARY=WinGet responded and listed a source. Packages were not changed."
} else {
  "GRADE=attention"
  "SUMMARY=WinGet responded, but the source list did not show the winget source. Nothing was reset."
}
`.trim(),

  "events-diagnose": `
$since = (Get-Date).AddHours(-72)
function Count-Level([string]$log, [int]$level) {
  return @(Get-WinEvent -FilterHashtable @{ LogName=$log; Level=$level; StartTime=$since } -MaxEvents 200 -ErrorAction SilentlyContinue).Count
}
$crit = (Count-Level 'System' 1) + (Count-Level 'Application' 1)
$err = (Count-Level 'System' 2) + (Count-Level 'Application' 2)
$warn = (Count-Level 'System' 3) + (Count-Level 'Application' 3)
"CRITICAL=$crit"
"ERRORS=$err"
"WARNINGS=$warn"
"WINDOW=72h"
"CAP=200"
if ($crit -gt 0) {
  "GRADE=warning"
  "SUMMARY=Critical events were in the newest System and Application records examined (72 hours, 200 per query)."
} elseif ($err -gt 10) {
  "GRADE=attention"
  "SUMMARY=Error events were in the examined window. This is a count, not a single-fault diagnosis."
} else {
  "GRADE=healthy"
  "SUMMARY=No critical events were in the examined System and Application window."
}
`.trim(),

  "bsod-diagnose": `
$dumps = @()
if (Test-Path 'C:\\Windows\\Minidump') {
  $dumps = @(Get-ChildItem 'C:\\Windows\\Minidump' -Filter '*.dmp' -ErrorAction SilentlyContinue)
}
"DUMPS=$($dumps.Count)"
if ($dumps.Count -gt 0) {
  $last = $dumps | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  "LAST_DUMP=$($last.LastWriteTime.ToString('o'))"
}
"MEMORY_DMP=$(Test-Path 'C:\\Windows\\MEMORY.DMP')"
$event = Get-WinEvent -FilterHashtable @{ LogName='System'; Id=1001; StartTime=(Get-Date).AddDays(-30) } -MaxEvents 1 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($event) {
  "BUGCHECK_TIME=$($event.TimeCreated.ToString('o'))"
  $text = [string]$event.Message
  if ($text.Length -gt 360) { $text = $text.Substring(0, 360) }
  "BUGCHECK=$($text -replace '\\r?\\n',' ')"
}
if ($dumps.Count -gt 0 -or $event) {
  "GRADE=attention"
  "SUMMARY=Crash evidence was found. The cause was not determined from this check."
} else {
  "GRADE=healthy"
  "SUMMARY=No minidump or bugcheck event from the last 30 days was found."
}
`.trim(),

  "wmi-diagnose": `
try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  "CAPTION=$($os.Caption)"
  $verify = & winmgmt.exe /verifyrepository 2>&1 | Out-String
  "VERIFY=$($verify.Trim())"
  if ($verify -match 'consistent') {
    "GRADE=healthy"
    "SUMMARY=CIM responded and the WMI repository reported consistent. It was not rebuilt."
  } else {
    "GRADE=attention"
    "SUMMARY=WMI verification was not clearly consistent. The repository was not rebuilt."
  }
} catch {
  "GRADE=warning"
  "SUMMARY=A CIM query failed. The WMI repository was not rebuilt."
  "DETAIL=$($_.Exception.Message)"
}
`.trim(),

  "shell-diagnose": `
$explorer = @(Get-Process -Name explorer -ErrorAction SilentlyContinue).Count
"EXPLORER=$explorer"
$search = Get-Service -Name WSearch -ErrorAction SilentlyContinue
if ($search) { "WSEARCH=$($search.Status)|$($search.StartType)" }
if ($explorer -lt 1) {
  "GRADE=attention"
  "SUMMARY=Explorer is not running. It was not restarted."
} else {
  "GRADE=healthy"
  "SUMMARY=Explorer is running. Shell settings were not changed."
}
`.trim(),

  "startup-diagnose": `
try {
  $rows = @(Get-CimInstance Win32_StartupCommand -ErrorAction Stop)
  "COUNT=$($rows.Count)"
  $rows | Select-Object -First 25 | ForEach-Object { "APP=$($_.Name)|$($_.Location)" }
  "GRADE=healthy"
  "SUMMARY=Startup commands were listed ($($rows.Count)). None were disabled."
} catch {
  "GRADE=unknown"
  "SUMMARY=Startup commands could not be listed. None were changed."
  "DETAIL=$($_.Exception.Message)"
}
`.trim(),

  "wu-repair": `
$ErrorActionPreference = 'Continue'
$names = 'bits','wuauserv','cryptsvc','msiserver'
foreach ($name in $names) { Stop-Service -Name $name -Force -ErrorAction SilentlyContinue }
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
foreach ($path in @("$env:SystemRoot\\SoftwareDistribution", "$env:SystemRoot\\System32\\catroot2")) {
  if (Test-Path -LiteralPath $path) {
    $dest = "$path.bak-$stamp"
    try {
      Rename-Item -LiteralPath $path -NewName (Split-Path $dest -Leaf) -ErrorAction Stop
      "RENAMED=$path|$dest"
    } catch {
      "RENAME_FAILED=$path|$($_.Exception.Message)"
    }
  } else {
    "MISSING=$path"
  }
}
foreach ($name in $names) { Start-Service -Name $name -ErrorAction SilentlyContinue }
$ok = $true
foreach ($name in 'wuauserv','bits') {
  $service = Get-Service -Name $name -ErrorAction SilentlyContinue
  "AFTER=$name|$($service.Status)"
  if (-not $service -or $service.Status -ne 'Running') { $ok = $false }
}
if ($ok) {
  "GRADE=healthy"
  "SUMMARY=Update services are running after the component folders were renamed. They were not deleted."
} else {
  "GRADE=warning"
  "SUMMARY=The reset ran, but Windows Update or BITS is not running. This is not a completed repair."
}
`.trim(),
};

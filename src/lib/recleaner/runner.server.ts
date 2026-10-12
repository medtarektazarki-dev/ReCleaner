import type { HostProfile, ServerResult } from "./types";
import { PROBE_SCRIPT } from "./diagnostics";
import { classifyDism, classifySfc, type Grade } from "./health";
import { redact } from "./redact";
import {
  EDITIONS,
  applyTokens,
  commandPreview,
  getPlan,
  validateField,
  type Plan,
  type Step,
} from "./plans";

type RunOut = { code: number | null; output: string; timedOut: boolean; error?: string };

async function runProcess(file: string, args: string[], timeoutMs: number): Promise<RunOut> {
  const { spawn } = await import("node:child_process");
  const name = file.split(/[/\\]/).pop()?.toLowerCase() ?? "";
  const durable = name === "dism.exe" || name === "sfc.exe";
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: RunOut) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let output = "";
    let overdue = false;
    const child = spawn(file, args, { windowsHide: true, shell: false });
    const append = (chunk: Buffer | string) => {
      output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (output.length > 30000) output = output.slice(-30000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
      if (durable) {
        overdue = true;
        return;
      }
      child.kill();
      finish({
        code: null,
        output: `${output}\nStopped: the operation exceeded its time limit. This is not a completed result.`,
        timedOut: true,
      });
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ code: null, output: error.message, timedOut: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const note = overdue ? "\nThe operation ran longer than expected and was not stopped." : "";
      finish({ code, output: output + note, timedOut: false });
    });
  });
}

function scrub(text: string): string {
  return redact(text);
}

function baseResult(
  plan: Plan,
  state: ServerResult["state"],
  summary: string,
  extra: Partial<ServerResult> & { started: number; isWindows: boolean; output?: string },
): ServerResult {
  return {
    actionId: plan.id,
    title: plan.title,
    state,
    summary: scrub(summary),
    exitCode: extra.exitCode ?? null,
    durationMs: Date.now() - extra.started,
    output: scrub(extra.output ?? ""),
    startedAt: new Date(extra.started).toISOString(),
    commands: commandPreview(plan).map((line) => scrub(line)),
    isWindows: extra.isWindows,
  };
}

async function isWindowsAdmin(): Promise<boolean> {
  const result = await runProcess("net.exe", ["session"], 8000);
  return result.code === 0;
}

export async function readHost(): Promise<HostProfile> {
  const os = await import("node:os");
  const isWindows = os.platform() === "win32";
  const cpu = os.cpus()[0];
  return {
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpus: os.cpus().length,
    cpuModel: cpu?.model ?? "Unknown",
    totalMem: os.totalmem(),
    freeMem: os.freemem(),
    uptime: os.uptime(),
    load1: os.loadavg()[0] ?? 0,
    isWindows,
    isAdmin: isWindows ? await isWindowsAdmin() : false,
    readAt: new Date().toISOString(),
  };
}

async function runSteps(steps: Step[], timeoutMs: number): Promise<{ output: string; code: number | null; timedOut: boolean; missing: boolean }> {
  const blocks: string[] = [];
  let code: number | null = 0;
  let timedOut = false;
  let missing = false;
  const slice = Math.max(15000, Math.floor(timeoutMs / Math.max(1, steps.length)));
  for (const step of steps) {
    blocks.push(`— ${step.label}`);
    const result = await runProcess(step.file, step.args, slice);
    if (result.output.trim()) blocks.push(result.output.trim());
    if (result.error) {
      missing = true;
      blocks.push(result.error);
      code = null;
      break;
    }
    if (result.timedOut) {
      timedOut = true;
      code = null;
      break;
    }
    if (result.code && result.code !== 0) code = result.code;
  }
  return { output: blocks.join("\n"), code, timedOut, missing };
}

async function runDism(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const check = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/CheckHealth", "/English"], 180000);
  let output = check.output;
  if (check.error || check.timedOut || check.code !== 0) {
    return baseResult(plan, "warning", "DISM CheckHealth did not complete cleanly. No repair was started.", { started, isWindows, output: output || check.error || "DISM returned no usable result.", exitCode: check.code });
  }
  let verdict = classifyDism({ check: check.output, imageState: "", scan: null });
  if (verdict.needsScan || verdict.repairId === "dism-smart") {
    const scan = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/ScanHealth", "/English"], 700000);
    output = `${output}\n${scan.output}`.trim();
    if (scan.error || scan.timedOut || scan.code !== 0) {
      return baseResult(plan, "warning", "DISM ScanHealth did not complete cleanly. RestoreHealth was not started.", { started, isWindows, output: output || scan.error || "No usable ScanHealth result.", exitCode: scan.code });
    }
    verdict = classifyDism({ check: "", imageState: "", scan: scan.output });
  }
  if (verdict.grade === "healthy") {
    return baseResult(plan, "success", "No component store corruption was detected. RestoreHealth was not started.", { started, isWindows, output, exitCode: 0 });
  }
  if (verdict.grade === "critical") return baseResult(plan, "warning", verdict.summary, { started, isWindows, output, exitCode: 0 });
  if (verdict.repairId !== "dism-smart") {
    return baseResult(plan, "warning", verdict.summary, { started, isWindows, output, exitCode: null });
  }
  const restore = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/RestoreHealth", "/English"], 900000);
  output = `${output}\n${restore.output}`.trim();
  if (restore.error || restore.timedOut || restore.code !== 0) {
    return baseResult(plan, "error", "RestoreHealth did not complete cleanly. Review output and scan again before retrying.", { started, isWindows, output: output || restore.error || "No usable RestoreHealth result.", exitCode: restore.code });
  }
  return baseResult(plan, "success", "DISM RestoreHealth completed successfully. Run a fresh scan to verify the image state.", { started, isWindows, output, exitCode: 0 });
}

async function runSfc(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const verify = await runProcess("sfc.exe", ["/verifyonly"], 900000);
  if (verify.error || verify.timedOut) {
    return baseResult(plan, "error", "System File Checker verification could not complete.", { started, isWindows, output: verify.output || verify.error || "SFC verification timed out.", exitCode: verify.code });
  }
  const verdict = classifySfc(verify.output, verify.code);
  if (!verdict.repairId) {
    return baseResult(plan, verdict.grade === "healthy" ? "success" : "warning", verdict.summary, { started, isWindows, output: verify.output, exitCode: verify.code });
  }
  const scan = await runProcess("sfc.exe", ["/scannow"], 1200000);
  const output = `${verify.output}\n${scan.output}`;
  if (scan.error || scan.timedOut || scan.code !== 0) {
    return baseResult(plan, "warning", "SFC repair did not complete cleanly. The system is not being reported as repaired.", { started, isWindows, output: output || scan.error || "No usable SFC repair result.", exitCode: scan.code });
  }
  const repaired = classifySfc(scan.output, scan.code);
  const clear = repaired.grade === "healthy";
  return baseResult(plan, clear ? "success" : "warning", clear ? "SFC reported no remaining integrity violations." : "SFC finished, but its output did not confirm a clean result. Review details and verify again.", { started, isWindows, output, exitCode: scan.code });
}


function graded(
  plan: Plan,
  grade: Grade,
  summary: string,
  repairId: string | undefined,
  raw: string,
  started: number,
  isWindows: boolean,
  exitCode: number | null,
): ServerResult {
  const lines = [`GRADE=${grade}`, `SUMMARY=${summary.replace(/\s+/g, " ").trim()}`];
  if (repairId) lines.push(`REPAIR=${repairId}`);
  const state = grade === "healthy" ? "success" : grade === "critical" ? "error" : "warning";
  return baseResult(plan, state, summary, { started, isWindows, output: `${lines.join("\n")}\n${raw}`, exitCode });
}

async function runDismCheck(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const check = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/CheckHealth", "/English"], 180000);
  if (check.error || check.timedOut || check.code !== 0) {
    return graded(plan, "unknown", "DISM CheckHealth did not complete cleanly. No repair was started.", undefined, check.output || check.error || "", started, isWindows, check.code);
  }
  let raw = check.output;
  let exitCode = check.code;
  let verdict = classifyDism({ check: check.output, imageState: "", scan: null });
  if (verdict.needsScan) {
    const scan = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/ScanHealth", "/English"], 700000);
    raw = `${raw}\n${scan.output}`.trim();
    if (scan.error || scan.timedOut || scan.code !== 0) {
      return graded(plan, "unknown", "ScanHealth did not complete cleanly. The image state remains unknown.", undefined, raw || scan.error || "", started, isWindows, scan.code);
    }
    verdict = classifyDism({ check: "", imageState: "", scan: scan.output });
    exitCode = scan.code;
  }
  return graded(plan, verdict.grade, verdict.summary, verdict.repairId, raw, started, isWindows, exitCode);
}

async function runSfcVerify(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const verify = await runProcess("sfc.exe", ["/verifyonly"], plan.timeoutMs);
  if (verify.error) {
    return graded(plan, "unknown", "System file checker could not be started. Repair was not started.", undefined, verify.error, started, isWindows, null);
  }
  const verdict = classifySfc(verify.output, verify.code);
  return graded(plan, verdict.grade, verdict.summary, verdict.repairId, verify.output, started, isWindows, verify.code);
}

async function runProbe(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const script = PROBE_SCRIPT[plan.id];
  if (!script) return graded(plan, "unknown", "This diagnostic has no command.", undefined, "", started, isWindows, 1);
  const result = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], plan.timeoutMs);
  if (result.error || result.timedOut || result.code !== 0) {
    const summary = result.timedOut ? "The diagnostic timed out. Partial output was not treated as a result." : result.error ? "The diagnostic could not be started." : "The diagnostic returned a non-zero exit code; its output was not treated as a valid result.";
    return graded(plan, "unknown", summary, undefined, result.output || result.error || "", started, isWindows, result.code);
  }
  const grade = result.output.match(/^GRADE=(healthy|attention|warning|critical|unknown)\s*$/m)?.[1] as Grade | undefined;
  const summary = result.output.match(/^SUMMARY=(.*)$/m)?.[1];
  if (!grade || !summary) return graded(plan, "unknown", "The diagnostic finished without a valid grade and summary. Nothing was changed.", undefined, result.output, started, isWindows, result.code);
  const state = grade === "healthy" ? "success" : grade === "critical" ? "error" : "warning";
  return baseResult(plan, state, summary, { started, isWindows, output: result.output, exitCode: result.code });
}


export const SERVICE_DIAGNOSTIC_SCRIPT = `
$names = @('RpcSs','DcomLaunch','EventLog','Schedule','Winmgmt','CryptSvc','Dhcp','Dnscache','BITS','wuauserv','WinDefend','mpssvc','Spooler','WlanSvc','bthserv','AudioSrv')
$warn = 0
foreach ($n in $names) {
  $s = Get-CimInstance Win32_Service -Filter ('Name=''' + $n + '''') -ErrorAction SilentlyContinue
  if (-not $s) { Write-Output ($n + '  missing'); $warn++; continue }
  $flag = 'OK'
  if ($s.State -eq 'Stopped' -and ($s.StartMode -eq 'Auto' -or $s.StartMode -eq 'Automatic')) { $flag = 'ATTENTION'; $warn++ }
  Write-Output ($n + '  ' + $s.State + '  ' + $s.StartMode + '  ' + $flag)
}
Write-Output ('ATTENTION_COUNT=' + $warn)
if ($warn -gt 0) {
  'GRADE=attention'
  'SUMMARY=Stopped automatic service. Nothing was changed.'
} else {
  'GRADE=healthy'
  'SUMMARY=Checked services are running, or they are not set to start automatically. Nothing was changed.'
}
`.trim();

async function dispatch(plan: Plan, params: Record<string, string>, started: number, isWindows: boolean): Promise<ServerResult> {
  if (plan.kind === "host") {
    const host = await readHost();
    const output = [
      `platform=${host.platform}`,
      `release=${host.release}`,
      `arch=${host.arch}`,
      `cpus=${host.cpus}`,
      `cpu=${host.cpuModel}`,
      `total=${host.totalMem}`,
      `free=${host.freeMem}`,
      `uptime=${Math.round(host.uptime)}`,
      `admin=${host.isAdmin}`,
    ].join("\n");
    return baseResult(plan, "success", host.isWindows ? "This PC was read. No changes were made." : "Host resources were read. No changes were made.", {
      started,
      isWindows,
      output,
      exitCode: 0,
    });
  }

  if (plan.kind === "relaunch") {
    const exe = process.env.RECLEANER_EXE;
    if (!exe) {
      return baseResult(plan, "warning", "REcleaner could not find its Windows executable to relaunch. Start the program with administrator rights.", {
        started,
        isWindows,
        output: "RECLEANER_EXE is not set.",
        exitCode: 1,
      });
    }
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", `Start-Process -FilePath '${exe.replace(/'/g, "")}' -Verb RunAs`], 20000);
    return baseResult(plan, result.code === 0 ? "success" : "error", result.code === 0 ? "Windows was asked to relaunch REcleaner with administrator rights." : "The relaunch request failed.", {
      started,
      isWindows,
      output: result.output,
      exitCode: result.code,
    });
  }

  if (plan.kind === "dism") return runDism(plan, started, isWindows);
  if (plan.kind === "dism-check") return runDismCheck(plan, started, isWindows);
  if (plan.kind === "sfc") return runSfc(plan, started, isWindows);
  if (plan.kind === "sfc-verify") return runSfcVerify(plan, started, isWindows);
  if (plan.kind === "probe") return runProbe(plan, started, isWindows);

  if (plan.kind === "services") {
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", SERVICE_DIAGNOSTIC_SCRIPT], plan.timeoutMs);
    const grade = result.output.match(/^GRADE=(healthy|attention)\s*$/m)?.[1];
    if (result.error || result.timedOut || result.code !== 0 || !grade) {
      return baseResult(plan, result.error ? "error" : "warning", "Service verification did not complete cleanly. A healthy state was not assumed.", { started, isWindows, output: result.output || result.error || "No structured service result was returned.", exitCode: result.code });
    }
    const attention = grade === "attention";
    return baseResult(plan, attention ? "warning" : "success", attention ? "One or more automatic services need attention. Nothing was changed." : "Checked services are running, or are not configured to start automatically. Nothing was changed.", { started, isWindows, output: result.output, exitCode: result.code });
  }

  if (plan.kind === "clean-temp") {
    const script = `
$ErrorActionPreference = 'Stop'
$systemRoot = [string](Get-ItemPropertyValue -LiteralPath 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -Name SystemRoot -ErrorAction Stop)
$systemRoot = [IO.Path]::GetFullPath($systemRoot).TrimEnd('\\')
$userProfile = [IO.Path]::GetFullPath($env:USERPROFILE).TrimEnd('\\')
$expectedLocal = [IO.Path]::GetFullPath((Join-Path $userProfile 'AppData\\Local')).TrimEnd('\\')
$local = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\\')
$root = [IO.Path]::GetPathRoot($systemRoot)
if ($systemRoot.Length -le 3 -or $systemRoot -ieq $root) { throw 'Windows directory failed safety validation. Cleanup cancelled.' }
if ($local -ine $expectedLocal -or $local.Length -le 3 -or $local -ieq [IO.Path]::GetPathRoot($local)) {
  throw 'Local AppData did not match the current profile. Cleanup cancelled to protect user files.'
}
$localItem = Get-Item -LiteralPath $local -Force -ErrorAction Stop
if (($localItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Local AppData is a reparse point. Cleanup cancelled.' }
$before = (Get-PSDrive -Name ([IO.Path]::GetPathRoot($systemRoot).Substring(0,1))).Free
$targets = @(
  (Join-Path $systemRoot 'Temp'),
  (Join-Path $local 'Temp'),
  (Join-Path $local 'Microsoft\\Windows\\INetCache'),
  (Join-Path $local 'D3DSCache'),
  (Join-Path $systemRoot 'Prefetch')
)
$allow = @{}
foreach ($candidate in $targets) { $allow[[IO.Path]::GetFullPath($candidate).TrimEnd('\\')] = $true }
$failed = 0
foreach ($candidate in $targets) {
  try {
    $full = [IO.Path]::GetFullPath($candidate).TrimEnd('\\')
    $pathRoot = [IO.Path]::GetPathRoot($full)
    if (-not $allow.ContainsKey($full) -or $full.Length -le 3 -or $full -ieq $pathRoot) { throw 'Cleanup path failed safety validation.' }
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
    $dir = Get-Item -LiteralPath $full -Force -ErrorAction Stop
    if (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { "SKIPPED_REPARSE=$full"; continue }
    foreach ($item in Get-ChildItem -LiteralPath $full -Force -ErrorAction Stop) {
      try {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
          Remove-Item -LiteralPath $item.FullName -Force -ErrorAction Stop
        } else {
          Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
        }
      } catch { $failed++; "ITEM_FAILED=$($item.Name)" }
    }
  } catch { $failed++; "TARGET_FAILED=$candidate" }
}
$after = (Get-PSDrive -Name ([IO.Path]::GetPathRoot($systemRoot).Substring(0,1))).Free
"FAILED_ITEMS=$failed"
"DifferenceBytes=$($after - $before)"
if ($failed -gt 0) { exit 1 }
exit 0
`.trim();
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", script], plan.timeoutMs);
    const match = result.output.match(/DifferenceBytes=(-?\d+)/);
    const delta = match ? Number(match[1]) : 0;
    const gb = (Math.round((Math.max(0, delta) / 1073741824) * 100) / 100).toFixed(2);
    if (result.error || result.timedOut || result.code !== 0 || !match) {
      return baseResult(plan, result.error ? "error" : "warning", "Temporary cleanup did not complete cleanly. Review the details; no completed cleanup is assumed.", { started, isWindows, output: result.output || result.error || "No cleanup result was returned.", exitCode: result.code });
    }
    return baseResult(plan, "success", `Temporary cleanup completed. The system reported about ${gb} GB more free space.`, { started, isWindows, output: result.output, exitCode: result.code });
  }

  if (plan.kind === "driver-scan") {
    const script = `
$ErrorActionPreference = 'Stop'
$searcher = (New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()
$searcher.Online = $true
$result = $searcher.Search("IsInstalled=0 and Type='Driver'")
if ($result.Updates.Count -eq 0) { 'No driver updates were offered.'; exit 0 }
foreach ($u in $result.Updates) { $u.Title }
Write-Output ('COUNT=' + $result.Updates.Count)
`.trim();
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", script], plan.timeoutMs);
    if (result.error || result.timedOut || result.code !== 0) {
      return baseResult(plan, result.error ? "error" : "warning", "Driver update search did not finish cleanly. No driver was installed.", { started, isWindows, output: result.output || result.error || "No driver search result was returned.", exitCode: result.code });
    }
    const count = result.output.match(/^COUNT=(\d+)\s*$/m);
    const n = count ? Number(count[1]) : 0;
    if (n > 0) return baseResult(plan, "warning", `${n} driver update(s) were offered. Nothing was installed.`, { started, isWindows, output: result.output, exitCode: result.code });
    if (/No driver updates were offered\./i.test(result.output)) return baseResult(plan, "success", "No driver updates were offered. Nothing was installed.", { started, isWindows, output: result.output, exitCode: result.code });
    return baseResult(plan, "warning", "Driver update search returned no recognizable result. No driver was installed.", { started, isWindows, output: result.output, exitCode: result.code });
  }

  if (plan.kind === "edition") {
    const edition = params.edition ?? "";
    const known = EDITIONS.find((item) => item.value === edition);
    if (!known) {
      return baseResult(plan, "error", "Choose a listed edition. Nothing was changed.", { started, isWindows, exitCode: 1 });
    }
    const listed = await runProcess("dism.exe", ["/Online", "/Get-TargetEditions"], 180000);
    if (listed.error || listed.timedOut || listed.code !== 0) {
      return baseResult(plan, "warning", "Windows target editions could not be checked cleanly. No edition change was started.", { started, isWindows, output: listed.output || listed.error || "", exitCode: listed.code });
    }
    if (!new RegExp(`\\b${known.value}\\b`, "i").test(listed.output)) {
      return baseResult(plan, "warning", `${known.label} is not an available target on this PC. No key was applied.`, {
        started,
        isWindows,
        output: listed.output,
        exitCode: listed.code,
      });
    }
    const change = await runProcess("changepk.exe", ["/ProductKey", known.key], 180000);
    const output = `${listed.output}\n${change.output}`;
    return baseResult(plan, change.code === 0 ? "success" : "error", change.code === 0 ? `Edition change for ${known.label} was requested. A restart may still be required.` : "The edition change did not complete. No success is assumed.", {
      started,
      isWindows,
      output,
      exitCode: change.code,
    });
  }

  if (plan.kind === "office-remove") {
    const script = `
$ErrorActionPreference = 'Stop'
$ids = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Office\\ClickToRun\\Configuration' -ErrorAction SilentlyContinue).ProductReleaseIds
if (-not $ids) { 'No Click-to-Run Office installation was detected. Nothing was removed.'; exit 2 }
Write-Output ('Detected: ' + $ids)
$dir = Join-Path $env:TEMP ('REcleaner_ODT_' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
winget download --id Microsoft.OfficeDeploymentTool --exact --download-directory $dir --accept-package-agreements --accept-source-agreements --disable-interactivity
if ($LASTEXITCODE -ne 0) { 'Office Deployment Tool could not be downloaded. Office was not removed.'; exit $LASTEXITCODE }
$pkg = Get-ChildItem $dir -Filter '*.exe' | Select-Object -First 1
if (-not $pkg) { 'The deployment tool package was missing. Office was not removed.'; exit 1 }
& $pkg.FullName /quiet /extract:$dir
$setup = Join-Path $dir 'setup.exe'
if (-not (Test-Path $setup)) { 'setup.exe was not extracted. Office was not removed.'; exit 1 }
$xml = Join-Path $dir 'remove.xml'
@'
<Configuration>
  <Remove All="TRUE" />
</Configuration>
'@ | Set-Content $xml -Encoding UTF8
& $setup /configure $xml
exit $LASTEXITCODE
`.trim();
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", script], plan.timeoutMs);
    const state = result.code === 0 ? "success" : result.code === 2 ? "warning" : "error";
    const summary = result.code === 0 ? "Office removal finished. Confirm in Apps if a product remains." : result.code === 2 ? "No Click-to-Run Office was detected. Nothing was removed." : "Office removal did not complete. Do not assume it was uninstalled.";
    return baseResult(plan, state, summary, { started, isWindows, output: result.output, exitCode: result.code });
  }

  const values: Record<string, string> = {};
  for (const field of plan.fields ?? []) {
    const checked = validateField(field, params[field] ?? "", Boolean(plan.optional?.includes(field)));
    if (!checked.ok) {
      return baseResult(plan, "error", checked.message, { started, isWindows, exitCode: 1 });
    }
    values[field] = checked.value;
  }
  if ((plan.id === "system-backup" || plan.id === "driver-backup" || plan.id === "driver-restore" || plan.id === "winget-export" || plan.id === "winget-import") && values.drive === "C" && plan.id === "system-backup") {
    return baseResult(plan, "error", "Choose a destination other than C:.", { started, isWindows, exitCode: 1 });
  }

  let steps = applyTokens(plan.steps ?? [], values);
  if (plan.id === "user-add" && !values.password) {
    steps = [{ label: "Create user", file: "net.exe", args: ["user", values.user ?? "", "/add"] }];
  }
  if ((plan.id === "fw-block" || plan.id === "fw-unblock") && values.exePath) {
    const base = values.exePath.split("\\").pop()?.replace(/[^A-Za-z0-9._-]/g, "") || "app";
    steps = steps.map((step) => ({
      ...step,
      args: step.args.map((arg) => (arg.startsWith("name=") ? `name=REcleaner_${base}` : arg)),
    }));
  }
  if (steps.length === 0) {
    return baseResult(plan, "error", "This action has no command.", { started, isWindows, exitCode: 1 });
  }
  const ran = await runSteps(steps, plan.timeoutMs);
  if (ran.missing) {
    return baseResult(plan, "error", "A required Windows program was not found. Nothing else was assumed.", {
      started,
      isWindows,
      output: ran.output,
      exitCode: null,
    });
  }
  if (ran.timedOut) {
    return baseResult(plan, "warning", "The operation was stopped because it ran too long. It did not finish.", {
      started,
      isWindows,
      output: ran.output,
      exitCode: null,
    });
  }
  const ok = ran.code === 0;
  return baseResult(plan, ok ? "success" : "warning", ok ? `${plan.title} finished.` : `${plan.title} returned a non-zero exit code. Read the details before assuming it worked.`, {
    started,
    isWindows,
    output: ran.output,
    exitCode: ran.code,
  });
}

export async function executeAction(actionId: string, params: Record<string, string>): Promise<ServerResult> {
  const started = Date.now();
  const os = await import("node:os");
  const isWindows = os.platform() === "win32";
  const plan = getPlan(actionId);
  if (!plan) {
    return {
      actionId,
      title: "Unknown action",
      state: "error",
      summary: "That action is not defined.",
      exitCode: 1,
      durationMs: Date.now() - started,
      output: "",
      startedAt: new Date(started).toISOString(),
      commands: [],
      isWindows,
    };
  }
  if (plan.windowsOnly && !isWindows) {
    return baseResult(plan, "unavailable", "This action runs on Windows only. Nothing was changed.", {
      started,
      isWindows,
      output: `Host platform: ${os.platform()}. The command was not started.`,
      exitCode: null,
    });
  }
  if (plan.admin && isWindows) {
    const admin = await isWindowsAdmin();
    if (!admin) {
      return baseResult(plan, "requires_admin", "Administrator access required. The command was not started.", {
        started,
        isWindows,
        output: "net session did not confirm an elevated process.",
        exitCode: null,
      });
    }
  }
  try {
    return await dispatch(plan, params, started, isWindows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action failed.";
    return baseResult(plan, "error", message, { started, isWindows, output: message, exitCode: 1 });
  }
}


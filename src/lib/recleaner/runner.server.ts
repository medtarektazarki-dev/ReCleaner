import type { HostProfile, ServerResult } from "./types";
import { PROBE_SCRIPT } from "./diagnostics";
import { classifyDism, classifySfc, type Grade } from "./health";
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
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: RunOut) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    let output = "";
    const child = spawn(file, args, { windowsHide: true, shell: false });
    const append = (chunk: Buffer | string) => {
      output += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (output.length > 30000) output = output.slice(-30000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const timer = setTimeout(() => {
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
      finish({ code, output, timedOut: false });
    });
  });
}

function scrub(text: string, keepKeys: boolean): string {
  const cut = text.slice(0, 24000);
  if (keepKeys) return cut;
  return cut.replace(/[A-Za-z0-9]{5}(?:-[A-Za-z0-9]{5}){4}/g, "XXXXX-XXXXX-XXXXX-XXXXX-XXXXX");
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
    summary,
    exitCode: extra.exitCode ?? null,
    durationMs: Date.now() - extra.started,
    output: scrub(extra.output ?? "", plan.id === "oem-key"),
    startedAt: new Date(extra.started).toISOString(),
    commands: commandPreview(plan),
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

const DISM_HEALTH =
  "$r = Repair-WindowsImage -Online -CheckHealth -ErrorAction SilentlyContinue; if ($r) { $r.ImageHealthState }";

async function runDism(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const check = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/CheckHealth"], 180000);
  const scan = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/ScanHealth"], 600000);
  const health = await runProcess("powershell.exe", ["-NoProfile", "-Command", DISM_HEALTH], 120000);
  const state = health.output.trim();
  let output = [check.output, scan.output, state].filter(Boolean).join("\n");
  if (check.error || scan.error) {
    return baseResult(plan, "error", "DISM could not be started.", { started, isWindows, output, exitCode: null });
  }
  if (/NonRepairable/i.test(state)) {
    return baseResult(plan, "warning", "The image is non-repairable. RestoreHealth was not started.", {
      started,
      isWindows,
      output,
      exitCode: health.code,
    });
  }
  if (/Repairable/i.test(state)) {
    const restore = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/RestoreHealth"], 900000);
    output += `\n${restore.output}`;
    if (restore.code === 0) {
      return baseResult(plan, "success", "Component store corruption was repaired.", {
        started,
        isWindows,
        output,
        exitCode: 0,
      });
    }
    return baseResult(plan, "error", "RestoreHealth did not complete.", {
      started,
      isWindows,
      output,
      exitCode: restore.code,
    });
  }
  if (/Healthy/i.test(state)) {
    return baseResult(plan, "success", "No component store corruption was detected. RestoreHealth was not started.", {
      started,
      isWindows,
      output,
      exitCode: 0,
    });
  }
  return baseResult(plan, "warning", "Image health was not clear. No repair was started.", {
    started,
    isWindows,
    output,
    exitCode: health.code,
  });
}

async function runSfc(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const verify = await runProcess("sfc.exe", ["/verifyonly"], 900000);
  const text = verify.output;
  if (verify.error) {
    return baseResult(plan, "error", "System file checker could not be started.", {
      started,
      isWindows,
      output: text || verify.error,
      exitCode: null,
    });
  }
  if (/did not find any integrity violations/i.test(text)) {
    return baseResult(plan, "success", "No integrity violations were detected. SFC repair was not started.", {
      started,
      isWindows,
      output: text,
      exitCode: verify.code,
    });
  }
  if (/found integrity violations/i.test(text)) {
    const scan = await runProcess("sfc.exe", ["/scannow"], 1200000);
    const output = `${text}\n${scan.output}`;
    return baseResult(plan, scan.code === 0 ? "success" : "warning", "Integrity violations were reported. SFC repair finished — read the result.", {
      started,
      isWindows,
      output,
      exitCode: scan.code,
    });
  }
  return baseResult(plan, "warning", "The verification result was not clear. SFC repair was not started.", {
    started,
    isWindows,
    output: text,
    exitCode: verify.code,
  });
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
  const check = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/CheckHealth"], 180000);
  const health = await runProcess("powershell.exe", ["-NoProfile", "-Command", DISM_HEALTH], 120000);
  if (check.error) {
    return graded(plan, "unknown", "DISM could not be started. No repair was started.", undefined, check.error, started, isWindows, null);
  }
  let raw = [check.output, health.output].filter(Boolean).join("\n");
  let verdict = classifyDism({ check: check.output, imageState: health.output, scan: null });
  if (verdict.needsScan) {
    const scan = await runProcess("dism.exe", ["/Online", "/Cleanup-Image", "/ScanHealth"], 700000);
    raw = `${raw}\n${scan.output}`;
    if (scan.error) {
      return graded(plan, "unknown", "ScanHealth could not be started. RestoreHealth was not started.", undefined, raw, started, isWindows, null);
    }
    verdict = classifyDism({ check: check.output, imageState: health.output, scan: scan.output });
  }
  return graded(plan, verdict.grade, verdict.summary, verdict.repairId, raw, started, isWindows, check.code);
}

async function runSfcVerify(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const verify = await runProcess("sfc.exe", ["/verifyonly"], plan.timeoutMs);
  if (verify.error) {
    return graded(plan, "unknown", "System file checker could not be started. Repair was not started.", undefined, verify.error, started, isWindows, null);
  }
  const verdict = classifySfc(verify.output);
  return graded(plan, verdict.grade, verdict.summary, verdict.repairId, verify.output, started, isWindows, verify.code);
}

async function runProbe(plan: Plan, started: number, isWindows: boolean): Promise<ServerResult> {
  const script = PROBE_SCRIPT[plan.id];
  if (!script) {
    return graded(plan, "unknown", "This diagnostic has no command.", undefined, "", started, isWindows, 1);
  }
  const result = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], plan.timeoutMs);
  if (result.error || result.timedOut) {
    return graded(
      plan,
      "unknown",
      result.timedOut ? "The diagnostic was stopped because it ran too long. Nothing was changed." : "The diagnostic could not be started. Nothing was changed.",
      undefined,
      result.output || result.error || "",
      started,
      isWindows,
      null,
    );
  }
  if (!/^GRADE=/m.test(result.output)) {
    return graded(plan, "unknown", "The diagnostic finished without a grade. Nothing was changed.", undefined, result.output, started, isWindows, result.code);
  }
  return baseResult(
    plan,
    /GRADE=healthy/.test(result.output) ? "success" : /GRADE=critical/.test(result.output) ? "error" : "warning",
    result.output.match(/^SUMMARY=(.*)$/m)?.[1] || "The diagnostic finished. Read the details.",
    { started, isWindows, output: result.output, exitCode: result.code },
  );
}

const SERVICE_SCRIPT = `
$names = @('RpcSs','DcomLaunch','EventLog','Schedule','Winmgmt','CryptSvc','Dhcp','Dnscache','BITS','wuauserv','WinDefend','mpssvc','Spooler','WlanSvc','bthserv','AudioSrv')
$warn = 0
foreach ($n in $names) {
  $s = Get-CimInstance Win32_Service -Filter ('Name=''' + $n + '''') -ErrorAction SilentlyContinue
  if (-not $s) { Write-Output ($n + '  missing'); $warn++; continue }
  $flag = 'OK'
  if ($s.State -eq 'Stopped' -and $s.StartMode -eq 'Auto') { $flag = 'ATTENTION'; $warn++ }
  Write-Output ($n + '  ' + $s.State + '  ' + $s.StartMode + '  ' + $flag)
}
Write-Output ('ATTENTION_COUNT=' + $warn)
if ($warn -gt 0) {
  'GRADE=attention'
  'SUMMARY=One or more automatic services need attention. Nothing was changed.'
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
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", SERVICE_SCRIPT], plan.timeoutMs);
    const attention = /ATTENTION_COUNT=([1-9]\d*)/.test(result.output);
    return baseResult(plan, result.error ? "error" : attention ? "warning" : "success", result.error ? "Service verification could not run." : attention ? "One or more automatic services need attention. Nothing was changed." : "Checked services are running or idle. Nothing was changed.", {
      started,
      isWindows,
      output: result.output || result.error || "",
      exitCode: result.code,
    });
  }

  if (plan.kind === "clean-temp") {
    const script = `
$before = (Get-PSDrive -Name ($env:SystemDrive.Substring(0,1))).Free
$targets = @(
  "$env:SystemRoot\\Temp",
  $env:TEMP,
  "$env:LOCALAPPDATA\\Temp",
  "$env:LOCALAPPDATA\\Microsoft\\Windows\\INetCache",
  "$env:LOCALAPPDATA\\D3DSCache"
)
foreach ($t in $targets) {
  if (Test-Path $t) { Get-ChildItem $t -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue }
}
$pref = "$env:SystemRoot\\Prefetch"
if (Test-Path $pref) { Remove-Item "$pref\\*" -Force -ErrorAction SilentlyContinue }
$after = (Get-PSDrive -Name ($env:SystemDrive.Substring(0,1))).Free
'DifferenceBytes=' + ($after - $before)
`.trim();
    const result = await runProcess("powershell.exe", ["-NoProfile", "-Command", script], plan.timeoutMs);
    const match = result.output.match(/DifferenceBytes=(-?\d+)/);
    const delta = match ? Number(match[1]) : 0;
    const gb = (Math.round((Math.max(0, delta) / 1073741824) * 100) / 100).toFixed(2);
    return baseResult(plan, result.code === 0 ? "success" : "warning", `Temporary files were cleaned. About ${gb} GB reported free.`, {
      started,
      isWindows,
      output: result.output,
      exitCode: result.code,
    });
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
    const count = result.output.match(/COUNT=(\d+)/);
    const n = count ? Number(count[1]) : 0;
    return baseResult(plan, result.error || (result.code && result.code !== 0) ? "warning" : n > 0 ? "warning" : "success", n > 0 ? `${n} driver update(s) were offered. Nothing was installed.` : "No driver updates were offered. Nothing was installed.", {
      started,
      isWindows,
      output: result.output || result.error || "",
      exitCode: result.code,
    });
  }

  if (plan.kind === "edition") {
    const edition = params.edition ?? "";
    const known = EDITIONS.find((item) => item.value === edition);
    if (!known) {
      return baseResult(plan, "error", "Choose a listed edition. Nothing was changed.", { started, isWindows, exitCode: 1 });
    }
    const listed = await runProcess("dism.exe", ["/Online", "/Get-TargetEditions"], 180000);
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


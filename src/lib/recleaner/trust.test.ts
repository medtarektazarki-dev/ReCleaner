import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PROBE_SCRIPT } from "./diagnostics.ts";
import { SCAN_STEPS, findingFromResult } from "./health.ts";
import { getPlan } from "./plans.ts";
import { redact } from "./redact.ts";
import { buildRepairPlan } from "./scan/plan.ts";
import type { ServerResult } from "./types.ts";

const SERVICE_DIAGNOSTIC_SCRIPT = (() => {
  const source = readFileSync(new URL("./runner.server.ts", import.meta.url), "utf8");
  const start = source.indexOf("export const SERVICE_DIAGNOSTIC_SCRIPT");
  const end = source.indexOf("async function dispatch");
  return source.slice(start, end);
})();

const READONLY_KINDS = new Set<string>(["probe", "host", "dism-check", "sfc-verify", "services"]);
const MUTATION = /Remove-Item|Stop-Service|Start-Service|Set-Service|Set-MpPreference|Clear-EventLog|wevtutil|scannow|RestoreHealth|key=clear|cipher\.exe|bcdedit|slmgr|advfirewall set|Disable-NetAdapter|Set-NetFirewallProfile/i;
const BLOCKED_FROM_SCAN = [
  "dism-smart",
  "sfc-smart",
  "wu-repair",
  "clean-temp",
  "dns-flush",
  "firewall-enable",
  "internet-reset",
  "wifi-passwords",
  "oem-key",
  "secure-wipe",
  "disable-updates",
  "debloat",
  "safe-mode",
  "defender-repair",
  "win-activate",
  "win-remove-key",
  "office-remove-key",
  "chkdsk",
];

function result(output: string, state: ServerResult["state"]): ServerResult {
  return {
    actionId: "x",
    title: "x",
    state,
    summary: "summary",
    exitCode: state === "success" ? 0 : 1,
    durationMs: 1,
    output,
    startedAt: "2026-10-08T00:00:00.000Z",
    commands: [],
    isWindows: true,
  };
}

test("full scan actions are read-only and known to the allowlist", () => {
  assert.equal(getPlan("not-a-real-action"), undefined);
  for (const step of SCAN_STEPS) {
    const plan = getPlan(step.actionId);
    if (!plan) {
      assert.fail(`missing plan ${step.actionId}`);
      continue;
    }
    assert.equal(READONLY_KINDS.has(plan.kind ?? ""), true, step.actionId);
    const raw =
      plan.kind === "probe" ? PROBE_SCRIPT[step.actionId] : plan.kind === "services" ? SERVICE_DIAGNOSTIC_SCRIPT : "";
    assert.equal(MUTATION.test(raw || ""), false, step.actionId);
  }
  for (const id of BLOCKED_FROM_SCAN) {
    assert.equal(SCAN_STEPS.some((step) => step.actionId === id), false, id);
    assert.ok(getPlan(id), id);
  }
});

test("a scan success without a grade is not called healthy", () => {
  const finding = findingFromResult(
    { id: "image", label: "Windows image", actionId: "dism-check" },
    result("The operation completed successfully.", "success"),
  );
  assert.equal(finding.grade, "unknown");
  assert.equal(finding.repairId, undefined);
});

test("verification that is not healthy stays a failure", () => {
  const finding = findingFromResult(
    { id: "files", label: "System files", actionId: "sfc-verify" },
    result("GRADE=warning\nSUMMARY=Integrity violations remain.\nREPAIR=sfc-smart", "warning"),
  );
  assert.equal(finding.grade, "warning");
  assert.notEqual(finding.grade, "healthy");
});

test("a healthy scan recommends no repair", () => {
  const findings = SCAN_STEPS.filter((step) => ["image", "files", "security", "firewall", "network"].includes(step.id)).map((step) =>
    findingFromResult(step, result("GRADE=healthy\nSUMMARY=ok", "success")),
  );
  assert.equal(buildRepairPlan(findings).steps.length, 0);
});

test("product keys and password lines never survive redaction", () => {
  const raw = [
    "OEM key: ABCDE-FGHIJ-KLMNO-PQRST-UVWXY",
    "Product key: VWXYZ-VWXYZ-VWXYZ-VWXYZ-VWXYZ",
    "Key Content : home-wifi-secret",
    "password=SecretValue",
    "Last five characters: VWXYZ",
    "GRADE=healthy",
  ].join("\n");
  const clean = redact(raw);
  assert.equal(clean.includes("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY"), false);
  assert.equal(clean.includes("VWXYZ-VWXYZ-VWXYZ-VWXYZ-VWXYZ"), false);
  assert.equal(clean.includes("home-wifi-secret"), false);
  assert.equal(clean.includes("SecretValue"), false);
  assert.equal(clean.includes("Last five characters: VWXYZ"), true);
  assert.equal(clean.includes("GRADE=healthy"), true);
});

test("the OEM and Wi-Fi plans do not print a full secret", () => {
  const oem = getPlan("oem-key");
  const wifi = getPlan("wifi-passwords");
  const oemScript = oem?.steps?.map((step) => step.args.join(" ")).join("\n") ?? "";
  const wifiScript = wifi?.steps?.map((step) => step.args.join(" ")).join("\n") ?? "";
  assert.equal(oemScript.includes("OEM key: "), false);
  assert.equal(/key=clear/i.test(wifiScript), false);
  assert.equal(wifiScript.toLowerCase().includes("password"), false);
});

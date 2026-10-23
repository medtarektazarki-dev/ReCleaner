import assert from "node:assert/strict";
import test from "node:test";
import { getPlan, planIds, validateField, type Plan } from "./plans.ts";

// Adding a program here is a deliberate security decision: every plan runs with the user's token, and
// many run elevated. The renderer can only pick a plan; it can never add to this list.
const ALLOWED_PROGRAMS = new Set([
  "C:\\Program Files\\Windows Defender\\MpCmdRun.exe",
  "attrib.exe",
  "bcdedit.exe",
  "chkdsk.exe",
  "chkntfs.exe",
  "cipher.exe",
  "cscript.exe",
  "defrag.exe",
  "dism.exe",
  "ipconfig.exe",
  "net.exe",
  "netsh.exe",
  "pnputil.exe",
  "powercfg.exe",
  "powershell.exe",
  "reg.exe",
  "sc.exe",
  "shutdown.exe",
  "wbadmin.exe",
  "winget.exe",
  "winsat.exe",
  "wsreset.exe",
]);

const plans = (): Plan[] => planIds().map((id) => getPlan(id)!);

test("plans only launch programs on the allowlist", () => {
  for (const plan of plans()) {
    for (const step of plan.steps ?? []) {
      assert.ok(ALLOWED_PROGRAMS.has(step.file), `${plan.id} launches ${step.file}`);
    }
  }
});

test("a step argument can only contain a token its plan declares as a field", () => {
  for (const plan of plans()) {
    for (const step of plan.steps ?? []) {
      const text = [step.file, ...step.args].join("\n");
      for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
        assert.ok(plan.fields?.includes(match[1] as never), `${plan.id} uses undeclared token ${match[0]}`);
      }
    }
  }
});

test("every declared field is used by the plan or handled by its special case", () => {
  // fw-unblock takes the program path only to work out the rule name (see prepareSteps).
  const derivesFromField = new Set(["fw-unblock"]);
  for (const plan of plans()) {
    if (plan.kind || derivesFromField.has(plan.id)) continue;
    const text = (plan.steps ?? []).flatMap((s) => [s.file, ...s.args]).join("\n");
    for (const field of plan.fields ?? []) {
      assert.match(text, new RegExp(`\\{\\{${field}\\}\\}`), `${plan.id} declares ${field} but never uses it`);
    }
  }
});

test("plans never use net.exe to stop or start a service", () => {
  for (const plan of plans()) {
    for (const step of plan.steps ?? []) {
      if (step.file === "net.exe") {
        assert.ok(!["stop", "start"].includes(step.args[0] ?? ""), `${plan.id}: net ${step.args.join(" ")} exits 2 when the service is already in that state`);
      }
    }
  }
});

test("a plan that stops a service for a repair always tries to start it again", () => {
  // These stop a service on purpose and leave it stopped or disabled.
  const intentional = new Set(["disable-updates", "telemetry-off", "tweak-sysmain", "tweak-all"]);
  for (const plan of plans()) {
    if (intentional.has(plan.id)) continue;
    const commands = (plan.steps ?? []).map((s) => ({ text: s.args.join(" "), always: s.always === true }));
    const stopped = commands.flatMap((c) => [...c.text.matchAll(/Stop-Service -Name '([^']+)'/g)].map((m) => m[1]!.toLowerCase()));
    for (const name of new Set(stopped)) {
      const restarts = commands.filter((c) => c.always && c.text.toLowerCase().includes(`start-service -name '${name}'`));
      assert.ok(restarts.length > 0, `${plan.id} stops ${name} without an always-run start step`);
    }
  }
});

test("a restart step comes after the stop it undoes", () => {
  for (const id of ["winupdate-repair", "fix-audio", "fix-bluetooth", "fix-printer", "restart-core", "enable-updates"]) {
    const texts = (getPlan(id)!.steps ?? []).map((s) => s.args.join(" "));
    for (const [index, text] of texts.entries()) {
      const stop = /Stop-Service -Name '([^']+)'/.exec(text);
      if (!stop) continue;
      const later = texts.slice(index + 1).findIndex((t) => t.includes(`Start-Service -Name '${stop[1]}'`));
      assert.ok(later >= 0, `${id}: no start of ${stop[1]} after its stop`);
    }
  }
});

test("network reset still resets Winsock and IP when DHCP release or renew fails", () => {
  const steps = getPlan("internet-reset")!.steps!;
  for (const step of steps.filter((s) => s.file === "ipconfig.exe" && /release|renew/.test(s.args[0] ?? ""))) {
    assert.equal(step.optional, true, step.label);
  }
  const resets = steps.filter((s) => s.file === "netsh.exe");
  assert.equal(resets.length, 2);
  assert.ok(resets.every((s) => s.optional !== true));
  const lastReset = steps.lastIndexOf(resets[1]!);
  const firstDhcp = steps.findIndex((s) => s.optional);
  assert.ok(lastReset < firstDhcp, "resets must run before the best-effort DHCP steps");
});

test("the hosts file is backed up under a new name each time, and a failed backup stops the change", () => {
  const script = getPlan("hosts-reset")!.steps![0]!.args.at(-1)!;
  assert.match(script, /\$ErrorActionPreference = 'Stop'/);
  assert.match(script, /Get-Date -Format 'yyyyMMddHHmmss'/);
  assert.doesNotMatch(script, /\.recleaner\.bak/);
  assert.ok(script.indexOf("Copy-Item") < script.indexOf("Set-Content"), "backup must come before the write");
  assert.doesNotMatch(script.slice(0, script.indexOf("Set-Content")), /SilentlyContinue/);
});

test("password and username fields", () => {
  assert.equal(validateField("password", "/active:no", false).ok, false);
  assert.equal(validateField("password", "*", false).ok, false);
  assert.equal(validateField("password", "a/b", false).ok, true);
  assert.deepEqual(validateField("password", "", true), { ok: true, value: "" });
  assert.equal(validateField("user", "bob smith", false).ok, false);
  assert.equal(validateField("user", "/bob", false).ok, false);
  assert.equal(validateField("drive", "1", false).ok, false);
  assert.deepEqual(validateField("drive", "e:", false), { ok: true, value: "E" });
});

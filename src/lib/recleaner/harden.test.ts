import assert from "node:assert/strict";
import test from "node:test";
import { classifyDism, classifySfc, failureFinding, findingFromResult, scoreForScan, serviceNeedsAttention, verifySteps, type Finding } from "./health.ts";
import { buildRepairPlan } from "./scan/plan.ts";
import { scoreFindings } from "./scan/score.ts";
import { redact } from "./redact.ts";
import type { ServerResult } from "./types.ts";

function result(output: string, state: ServerResult["state"] = "success"): ServerResult {
  return {
    actionId: "x",
    title: "x",
    state,
    summary: "summary",
    exitCode: 0,
    durationMs: 1,
    output,
    startedAt: "2026-10-08T00:00:00.000Z",
    commands: [],
    isWindows: true,
  };
}

function finding(id: string, actionId: string, output: string, state: ServerResult["state"] = "success"): Finding {
  return findingFromResult({ id, label: id, actionId }, result(output, state));
}

test("all measured healthy categories score 100", () => {
  const findings = ["image", "files", "update", "security", "firewall", "disk", "services", "network", "crashes"].map((id) =>
    finding(id, "defender-status", "GRADE=healthy\nSUMMARY=ok"),
  );
  assert.equal(scoreFindings(findings).score, 100);
  assert.equal(scoreFindings(findings).status, "excellent");
});

test("all measured critical categories score 0", () => {
  const findings = [finding("image", "dism-check", "GRADE=critical\nSUMMARY=bad"), finding("disk", "disk-diagnose", "GRADE=critical\nSUMMARY=bad")];
  assert.equal(scoreFindings(findings).score, 0);
  assert.equal(scoreFindings(findings).status, "critical");
});

test("unknown, unavailable, and needs-admin are excluded and an empty set is not scored", () => {
  const unknown = finding("image", "dism-check", "", "unavailable");
  const admin = findingFromResult({ id: "files", label: "Files", actionId: "sfc-verify" }, result("", "requires_admin"));
  const failed = failureFinding({ id: "security", label: "Security", actionId: "defender-status" });
  assert.equal(unknown.grade, "unknown");
  assert.equal(admin.grade, "unknown");
  assert.equal(failed.grade, "unknown");
  assert.equal(scoreFindings([unknown, admin, failed]).score, null);
  const one = scoreFindings([finding("network", "network-diagnose", "GRADE=warning\nSUMMARY=down"), unknown]);
  assert.equal(one.weightUsed, 5);
  assert.equal(one.score, 50);
  const mixed = scoreFindings([
    finding("image", "dism-check", "GRADE=healthy\nSUMMARY=ok"),
    finding("files", "sfc-verify", "GRADE=healthy\nSUMMARY=ok"),
    finding("update", "wu-diagnose", "GRADE=healthy\nSUMMARY=ok"),
    finding("security", "defender-status", "", "unavailable"),
    finding("firewall", "firewall-status", "GRADE=healthy\nSUMMARY=ok"),
    finding("disk", "disk-diagnose", "GRADE=warning\nSUMMARY=low"),
    finding("services", "services-diagnostic", "GRADE=healthy\nSUMMARY=ok"),
    finding("network", "network-diagnose", "GRADE=healthy\nSUMMARY=ok"),
    finding("crashes", "bsod-diagnose", "GRADE=healthy\nSUMMARY=ok"),
  ]);
  assert.equal(mixed.weightUsed, 85);
  assert.equal(mixed.score, Math.round((77.5 / 85) * 100));
});

test("a cancelled scan is not scored even when finished checks are healthy", () => {
  const findings = [finding("image", "dism-check", "GRADE=healthy\nSUMMARY=ok")];
  assert.equal(scoreForScan(findings, true).score, null);
  assert.equal(scoreForScan(findings, true).status, "unknown");
  assert.equal(scoreForScan(findings, false).score, 100);
});

test("a failed check does not become healthy and does not remove other results", () => {
  const broken = findingFromResult({ id: "wmi", label: "WMI", actionId: "wmi-diagnose" }, result("not graded", "error"));
  assert.notEqual(broken.grade, "healthy");
  const kept = scoreFindings([finding("image", "dism-check", "GRADE=healthy\nSUMMARY=ok"), failureFinding({ id: "files", label: "Files", actionId: "sfc-verify" })]);
  assert.equal(kept.score, 100);
  assert.equal(kept.weightUsed, 15);
});

test("repair plans follow evidence and keep optional repairs unchecked", () => {
  const filesOnly = buildRepairPlan([
    finding("image", "dism-check", "GRADE=healthy\nSUMMARY=Image is healthy."),
    finding("files", "sfc-verify", "GRADE=warning\nSUMMARY=Violations.\nREPAIR=sfc-smart"),
  ]);
  assert.deepEqual(filesOnly.steps.map((step) => step.actionId), ["sfc-smart"]);

  const both = buildRepairPlan([
    finding("image", "dism-check", "GRADE=warning\nSUMMARY=Repairable.\nREPAIR=dism-smart"),
    finding("files", "sfc-verify", "GRADE=warning\nSUMMARY=Violations.\nREPAIR=sfc-smart"),
    finding("firewall", "firewall-status", "GRADE=critical\nSUMMARY=Off."),
    finding("network", "network-diagnose", "GRADE=attention\nSUMMARY=DNS failed.\nREPAIR=dns-flush"),
    finding("security", "defender-status", "GRADE=attention\nSUMMARY=Defender is off."),
  ]);
  const ids = both.steps.map((step) => step.actionId);
  assert.deepEqual(ids.slice(0, 2), ["dism-smart", "sfc-smart"]);
  assert.equal(both.steps.find((step) => step.actionId === "firewall-enable")?.selected, false);
  assert.equal(both.steps.find((step) => step.actionId === "dns-flush")?.selected, false);
  assert.equal(ids.includes("internet-reset"), false);
  assert.equal(ids.some((id) => id.includes("defender")), false);
  assert.equal(buildRepairPlan([finding("security", "defender-status", "GRADE=healthy\nSUMMARY=ok")]).steps.length, 0);
});

test("verification runs the diagnostic again and DISM is verified before SFC", () => {
  assert.deepEqual(verifySteps(["dism-smart", "sfc-smart"]).map((step) => step.actionId), ["dism-check", "sfc-verify"]);
});

test("sfc and dism classification do not recommend a repair for a healthy result", () => {
  assert.equal(classifySfc("Windows Resource Protection did not find any integrity violations.").repairId, undefined);
  assert.equal(classifySfc("", 0).repairId, undefined);
  assert.equal(classifySfc("", 1).repairId, "sfc-smart");
  assert.equal(classifySfc("localized output", 2).grade, "unknown");
  assert.equal(classifyDism({ check: "", imageState: "Healthy", scan: null }).repairId, undefined);
  assert.equal(classifyDism({ check: "The component store is repairable.", imageState: "", scan: null }).repairId, "dism-smart");
  assert.equal(classifyDism({ check: "", imageState: "NonRepairable", scan: null }).repairId, undefined);
});

test("service startup type decides whether a stopped service is a problem", () => {
  assert.equal(serviceNeedsAttention("Stopped", "Auto"), true);
  assert.equal(serviceNeedsAttention("Stopped", "Automatic"), true);
  assert.equal(serviceNeedsAttention("Stopped", "Manual"), false);
  assert.equal(serviceNeedsAttention("Stopped", "Disabled"), false);
  assert.equal(serviceNeedsAttention("Running", "Auto"), false);
});

test("diagnostic text redacts product keys and password lines", () => {
  const raw = "Installed key ABCDE-FGHIJ-KLMNO-PQRST-UVWXY\nKey Content : home-wifi-secret\nGRADE=healthy";
  const clean = redact(raw);
  assert.equal(clean.includes("ABCDE-FGHIJ-KLMNO-PQRST-UVWXY"), false);
  assert.equal(clean.includes("home-wifi-secret"), false);
  assert.equal(clean.includes("GRADE=healthy"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { findingFromResult, type Finding } from "../health.ts";
import { buildRepairPlan } from "./plan.ts";
import { scoreFindings } from "./score.ts";
import type { ServerResult } from "../types.ts";

function result(output: string, state: ServerResult["state"] = "success"): ServerResult {
  return {
    actionId: "x",
    title: "x",
    state,
    summary: "",
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

test("a healthy scored set is excellent and recommends nothing", () => {
  const findings = [
    finding("image", "dism-check", "GRADE=healthy\nSUMMARY=Image is healthy."),
    finding("files", "sfc-verify", "GRADE=healthy\nSUMMARY=Files are healthy."),
    finding("security", "defender-status", "GRADE=healthy\nSUMMARY=Defender is on."),
  ];
  const score = scoreFindings(findings);
  assert.equal(score.score, 100);
  assert.equal(score.status, "excellent");
  assert.equal(buildRepairPlan(findings).steps.length, 0);
});

test("unknown categories are left out instead of scoring zero", () => {
  const findings = [
    finding("image", "dism-check", "", "unavailable"),
    finding("files", "sfc-verify", "GRADE=healthy\nSUMMARY=Files are healthy."),
  ];
  const score = scoreFindings(findings);
  assert.equal(score.score, 100);
  assert.equal(score.weightUsed, 15);
  assert.equal(scoreFindings([findings[0]!]).score, null);
});

test("repairable image and system files plan DISM before SFC", () => {
  const findings = [
    finding("image", "dism-check", "GRADE=warning\nSUMMARY=Repairable.\nREPAIR=dism-smart"),
    finding("files", "sfc-verify", "GRADE=warning\nSUMMARY=Violations.\nREPAIR=sfc-smart"),
  ];
  const plan = buildRepairPlan(findings);
  const ids = plan.steps.map((step) => step.actionId);
  assert.deepEqual(ids, ["dism-smart", "sfc-smart"]);
  assert.ok(ids.indexOf("dism-smart") < ids.indexOf("sfc-smart"));
  assert.deepEqual(plan.steps[1]?.dependencies, ["dism-smart"]);
  assert.equal(plan.recommendRestore, true);
  const score = scoreFindings(findings);
  assert.equal(score.score, 50);
  assert.equal(score.status, "attention");
});

test("critical disk scores zero for that weight and does not invent a cleanup", () => {
  const findings = [finding("disk", "disk-diagnose", "GRADE=critical\nSUMMARY=Disk is unhealthy.")];
  assert.equal(scoreFindings(findings).score, 0);
  assert.equal(scoreFindings(findings).status, "critical");
  assert.equal(buildRepairPlan(findings).steps.length, 0);
});

test("firewall and DNS repairs are offered unchecked", () => {
  const findings = [
    finding("firewall", "firewall-status", "GRADE=critical\nSUMMARY=Firewall profiles are off."),
    finding("network", "network-diagnose", "GRADE=attention\nSUMMARY=DNS failed.\nREPAIR=dns-flush"),
  ];
  const plan = buildRepairPlan(findings);
  assert.equal(plan.steps.every((step) => step.selected === false), true);
  assert.equal(plan.recommendRestore, false);
  assert.equal(plan.steps.some((step) => step.actionId === "internet-reset"), false);
});

test("SFC alone does not depend on DISM", () => {
  const findings = [finding("files", "sfc-verify", "GRADE=warning\nSUMMARY=Violations.\nREPAIR=sfc-smart")];
  const plan = buildRepairPlan(findings);
  assert.deepEqual(plan.steps[0]?.dependencies, []);
});

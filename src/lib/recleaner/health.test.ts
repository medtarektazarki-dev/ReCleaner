import assert from "node:assert/strict";
import test from "node:test";
import { classifyDism, classifySfc, findingFromResult, healthScore, repairChoices } from "./health.ts";
import type { ServerResult } from "./types.ts";

function result(partial: Partial<ServerResult>): ServerResult {
  return {
    actionId: "x",
    title: "x",
    state: "success",
    summary: "",
    exitCode: 0,
    durationMs: 1,
    output: "",
    startedAt: "2026-10-08T00:00:00.000Z",
    commands: [],
    isWindows: true,
    ...partial,
  };
}

test("sfc verify does not recommend repair when clean", () => {
  const found = classifySfc("Windows Resource Protection did not find any integrity violations.");
  assert.equal(found.grade, "healthy");
  assert.equal(found.repairId, undefined);
});

test("sfc verify recommends repair only when violations are reported", () => {
  const found = classifySfc("Windows Resource Protection found integrity violations.");
  assert.equal(found.grade, "warning");
  assert.equal(found.repairId, "sfc-smart");
});

test("dism asks for ScanHealth only when CheckHealth is inconclusive", () => {
  const unclear = classifyDism({ check: "The operation completed successfully.", imageState: "", scan: null });
  assert.equal(unclear.needsScan, true);
  const healthy = classifyDism({ check: "No component store corruption detected.", imageState: "Healthy", scan: null });
  assert.equal(healthy.needsScan, false);
  assert.equal(healthy.grade, "healthy");
  assert.equal(healthy.repairId, undefined);
});

test("dism repairable recommends RestoreHealth and does not treat 'not repairable' as repairable", () => {
  const bad = classifyDism({ check: "", imageState: "", scan: "The component store is not repairable." });
  assert.equal(bad.grade, "critical");
  assert.equal(bad.repairId, undefined);
  const fix = classifyDism({ check: "", imageState: "Repairable", scan: "The component store is repairable." });
  assert.equal(fix.repairId, "dism-smart");
});

test("weighted score ignores unknown categories", () => {
  const findings = [
    findingFromResult({ id: "security", label: "Security", actionId: "defender-status" }, result({ output: "GRADE=healthy\nSUMMARY=ok" })),
    findingFromResult({ id: "update", label: "Windows Update", actionId: "wu-diagnose" }, result({ state: "unavailable", summary: "Windows only", output: "" })),
    findingFromResult({ id: "disk", label: "Disk", actionId: "disk-diagnose" }, result({ output: "GRADE=warning\nSUMMARY=low\nTEMP_BYTES=500000000\nREPAIR=clean-temp" })),
  ];
  const score = healthScore(findings);
  assert.equal(score.included.length, 2);
  assert.equal(score.score, 75);
  assert.equal(score.status, "good");
  const repairs = repairChoices(findings);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0]?.actionId, "clean-temp");
  assert.match(repairs[0]?.title ?? "", /MB/);
});

test("tiny temp measurements are not recommended for cleanup", () => {
  const finding = findingFromResult(
    { id: "disk", label: "Disk", actionId: "disk-diagnose" },
    result({ output: "GRADE=attention\nSUMMARY=small\nTEMP_BYTES=1000\nREPAIR=clean-temp" }),
  );
  assert.equal(finding.repairId, undefined);
});

test("unavailable windows probes are not scored", () => {
  const finding = findingFromResult(
    { id: "files", label: "System files", actionId: "sfc-verify" },
    result({ state: "unavailable", summary: "This action runs on Windows only. Nothing was changed.", output: "not started" }),
  );
  assert.equal(finding.grade, "unknown");
  assert.equal(healthScore([finding]).score, null);
});

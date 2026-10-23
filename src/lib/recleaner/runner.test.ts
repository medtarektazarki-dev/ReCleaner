import assert from "node:assert/strict";
import test from "node:test";
import { classifySfc } from "./health.ts";
import { getPlan } from "./plans.ts";
import {
  checkTarget,
  classifyRestorePoint,
  executeAction,
  prepareSteps,
  resolveTool,
  runProcess,
  runSteps,
} from "./runner.server.ts";
import type { Step } from "./plans.ts";

const node = process.execPath;
const ctx = { systemDrive: "C", currentUser: "Alice" };

function plan(id: string) {
  const found = getPlan(id);
  assert.ok(found, `missing plan ${id}`);
  return found;
}

test("runProcess reads UTF-16 output from sfc.exe as plain text", async () => {
  const text = "Windows Resource Protection did not find any integrity violations.\r\n";
  const out = await runProcess(node, ["-e", `process.stdout.write(Buffer.from(${JSON.stringify(text)}, "utf16le"))`], 10000);
  assert.equal(out.code, 0);
  assert.equal(out.output.includes("\u0000"), false);
  assert.match(out.output, /did not find any integrity violations/);
  assert.equal(classifySfc(out.output, out.code).grade, "healthy");
});

test("runProcess closes standard input so a tool that asks a question cannot hang", async () => {
  const script = "let n=0;process.stdin.on('data',d=>n+=d.length);process.stdin.on('end',()=>console.log('EOF',n));process.stdin.resume()";
  const out = await runProcess(node, ["-e", script], 10000);
  assert.equal(out.timedOut, false);
  assert.match(out.output, /EOF 0/);
});

test("runProcess delivers requested input and then closes it", async () => {
  const script = "let n=0;process.stdin.on('data',d=>n+=d.length);process.stdin.on('end',()=>console.log('EOF',n));process.stdin.resume()";
  const out = await runProcess(node, ["-e", script], 10000, "Y\r\n");
  assert.match(out.output, /EOF 3/);
});

test("runProcess stops an ordinary process at its time limit and says so", async () => {
  const out = await runProcess(node, ["-e", "setTimeout(() => {}, 60000)"], 300);
  assert.equal(out.timedOut, true);
  assert.equal(out.code, null);
  assert.match(out.output, /not a completed result/);
});

test("runProcess reports a missing program as an error, not a result", async () => {
  const out = await runProcess("recleaner-no-such-program", [], 5000);
  assert.ok(out.error);
  assert.equal(out.code, null);
});

test("runProcess does not pass arguments through a shell", async () => {
  const out = await runProcess(node, ["-e", "console.log(process.argv.slice(1).join('|'))", "a;b", "$(x)", "&& y"], 10000);
  assert.match(out.output, /a;b\|\$\(x\)\|&& y/);
});

const step = (label: string, ...rest: Partial<Step>[]): Step => Object.assign({ label, file: "tool", args: [label] }, ...rest);

function scripted(results: Record<string, { code?: number | null; error?: string; timedOut?: boolean; output?: string }>) {
  const calls: string[] = [];
  const run = async (_file: string, args: string[]) => {
    calls.push(args[0] ?? "");
    const r = results[args[0] ?? ""] ?? {};
    return { code: r.code === undefined ? 0 : r.code, output: r.output ?? "", timedOut: r.timedOut ?? false, error: r.error };
  };
  return { calls, run };
}

test("runSteps runs every step when all succeed", async () => {
  const { calls, run } = scripted({});
  const out = await runSteps([step("a"), step("b")], 60000, run);
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(out.code, 0);
});

test("runSteps stops at the first failure but still runs steps that undo earlier work", async () => {
  const { calls, run } = scripted({ stop: { code: 2, output: "access denied" } });
  const out = await runSteps(
    [step("stop-a"), step("stop", {}), step("delete cache"), step("start-a", { always: true }), step("start-b", { always: true })],
    60000,
    run,
  );
  assert.deepEqual(calls, ["stop-a", "stop", "start-a", "start-b"]);
  assert.equal(out.code, 2);
  assert.match(out.output, /delete cache \(not run: an earlier step failed\)/);
});

test("runSteps keeps the first failure when a recovery step also fails", async () => {
  const { run } = scripted({ first: { code: 5 }, restart: { code: 1 } });
  const out = await runSteps([step("first"), step("restart", { always: true })], 60000, run);
  assert.equal(out.code, 5);
});

test("runSteps does not count an optional step as a failure", async () => {
  const { calls, run } = scripted({ release: { code: 1, output: "no adapter is in the state permissible" } });
  const out = await runSteps([step("flush"), step("release", { optional: true }), step("reset")], 60000, run);
  assert.deepEqual(calls, ["flush", "release", "reset"]);
  assert.equal(out.code, 0);
  assert.match(out.output, /optional step ended with exit code 1/);
});

test("runSteps reports a missing program and a timeout distinctly, with no exit code", async () => {
  const missing = await runSteps([step("a")], 60000, scripted({ a: { code: null, error: "spawn ENOENT" } }).run);
  assert.equal(missing.missing, true);
  assert.equal(missing.code, null);
  const slow = await runSteps([step("a")], 60000, scripted({ a: { code: null, timedOut: true } }).run);
  assert.equal(slow.timedOut, true);
  assert.equal(slow.code, null);
});

test("every Windows tool resolves to System32 when it exists, and otherwise falls back unchanged", () => {
  const exists = (path: string) => path.startsWith("C:\\Windows\\System32\\");
  assert.equal(resolveTool("net.exe", "win32", "C:\\Windows", exists), "C:\\Windows\\System32\\net.exe");
  assert.equal(
    resolveTool("powershell.exe", "win32", "C:\\Windows\\", () => true),
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
  );
  assert.equal(resolveTool("winget.exe", "win32", "C:\\Windows", () => false), "winget.exe");
  assert.equal(resolveTool("C:\\Program Files\\Windows Defender\\MpCmdRun.exe", "win32", "C:\\Windows", () => true), "C:\\Program Files\\Windows Defender\\MpCmdRun.exe");
  assert.equal(resolveTool("net.exe", "linux", "C:\\Windows", () => true), "net.exe");
});

test("a request can never name a program: only the plan's own steps are built", () => {
  const prepared = prepareSteps(plan("winget-uninstall"), { packageId: "Google.Chrome", file: "cmd.exe", args: "/c calc" }, ctx);
  assert.ok(prepared.ok);
  assert.deepEqual(prepared.steps.map((s) => s.file), ["winget.exe"]);
  assert.deepEqual(prepared.steps[0]?.args, ["uninstall", "--id", "Google.Chrome", "--exact", "--silent", "--purge"]);
});

test("field values that could carry extra arguments are rejected before any command is built", () => {
  const bad: [string, Record<string, string>][] = [
    ["user-password", { user: "bob", password: "/delete" }],
    ["user-add", { user: "bob", password: "*" }],
    ["user-add", { user: "bob /add", password: "x" }],
    ["winget-search", { packageId: "--source evil" }],
    ["winget-uninstall", { packageId: "a b" }],
    ["driver-delete", { publishedName: "oem1.inf /force" }],
    ["fw-block", { exePath: "C:\\Windows\\system32\\..\\x.txt" }],
    ["shutdown-schedule", { minutes: "0" }],
    ["shutdown-schedule", { minutes: "1; calc" }],
    ["chkdsk", { drive: "CD" }],
    ["win-activate", { productKey: "NOT-A-KEY" }],
  ];
  for (const [id, params] of bad) {
    assert.equal(prepareSteps(plan(id), params, ctx).ok, false, `${id} ${JSON.stringify(params)} was accepted`);
  }
});

test("a password may contain an ordinary slash, only a leading switch character is refused", () => {
  assert.ok(prepareSteps(plan("user-password"), { user: "bob", password: "pa/ss*word" }, ctx).ok);
  assert.ok(prepareSteps(plan("user-password"), { user: "bob", password: "-dash" }, ctx).ok);
});

test("the signed-in account cannot be deleted, disabled, or demoted", () => {
  for (const id of ["user-delete", "user-disable", "user-revoke"]) {
    const refused = prepareSteps(plan(id), { user: "alice" }, ctx);
    assert.equal(refused.ok, false, id);
    assert.ok(prepareSteps(plan(id), { user: "bob" }, ctx).ok, `${id} should accept another account`);
  }
  assert.ok(prepareSteps(plan("user-enable"), { user: "alice" }, ctx).ok);
});

test("clearing attributes on the Windows drive is refused, other drives are allowed", () => {
  assert.equal(prepareSteps(plan("usb-rescue"), { drive: "c" }, ctx).ok, false);
  assert.equal(prepareSteps(plan("usb-rescue"), { drive: "C:" }, ctx).ok, false);
  const other = prepareSteps(plan("usb-rescue"), { drive: "e:" }, ctx);
  assert.ok(other.ok);
  assert.deepEqual(other.steps[0]?.args.slice(-1), ["E:\\*.*"]);
});

test("a system image cannot be written to the Windows drive", () => {
  assert.equal(prepareSteps(plan("system-backup"), { drive: "C" }, ctx).ok, false);
  assert.equal(prepareSteps(plan("system-backup"), { drive: "C" }, { ...ctx, systemDrive: "D" }).ok, true);
  assert.equal(prepareSteps(plan("system-backup"), { drive: "D" }, ctx).ok, true);
});

test("chkdsk answers its restart prompt only for the Windows drive", () => {
  const system = prepareSteps(plan("chkdsk"), { drive: "C" }, ctx);
  assert.ok(system.ok);
  assert.equal(system.steps[0]?.input, "Y\r\n");
  const data = prepareSteps(plan("chkdsk"), { drive: "E" }, ctx);
  assert.ok(data.ok);
  assert.equal(data.steps[0]?.input, undefined);
});

test("firewall rules are named per program so unblocking one program leaves the others", () => {
  const block = prepareSteps(plan("fw-block"), { exePath: "C:\\Games\\Some Game\\game.exe" }, ctx);
  assert.ok(block.ok);
  assert.ok(block.steps.every((s) => s.args.includes("name=REcleaner_game.exe")));
  assert.ok(block.steps.every((s) => s.args.includes("program=C:\\Games\\Some Game\\game.exe")));
});

test("checkTarget ignores plans that do not opt in", () => {
  assert.equal(checkTarget(plan("defrag"), { drive: "C" }, ctx), null);
  assert.equal(checkTarget(plan("user-enable"), { user: "alice" }, ctx), null);
});

test("a restore point counts as made only when Windows says a newer one exists", () => {
  assert.equal(classifyRestorePoint("RESTORE_POINT=created\nSEQUENCE=42", 0).state, "success");
  // Checkpoint-Computer exits 0 when Windows silently skips it because of the 24-hour limit.
  const skipped = classifyRestorePoint("RESTORE_POINT=not-created\nREASON=already created within the past 1440 minutes", 3);
  assert.equal(skipped.state, "warning");
  assert.match(skipped.summary, /did not create a new restore point/);
  assert.equal(classifyRestorePoint("RESTORE_POINT=created", 1).state, "error");
  assert.equal(classifyRestorePoint("", 0).state, "error");
  assert.equal(classifyRestorePoint("CHECKPOINT_ERROR=Access is denied", 1).state, "error");
});

test("on a non-Windows host a Windows action is unavailable and nothing is started", async () => {
  if (process.platform === "win32") return;
  const result = await executeAction("restore-point", {});
  assert.equal(result.state, "unavailable");
  assert.equal(result.exitCode, null);
});

test("an unknown action id is rejected", async () => {
  const result = await executeAction("format-c", {});
  assert.equal(result.state, "error");
  assert.equal(result.title, "Unknown action");
});

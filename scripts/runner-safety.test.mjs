import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/lib/recleaner/runner.server.ts", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `Missing section start: ${start}`);
  assert.notEqual(to, -1, `Missing section end: ${end}`);
  return source.slice(from, to);
}

test("temporary cleanup never deletes from a raw TEMP environment path", () => {
  const cleanup = section('if (plan.kind === "clean-temp") {', 'if (plan.kind === "driver-scan")');
  assert.doesNotMatch(cleanup, /^\s*\$env\.TEMP\s*,?\s*$/m);
  assert.match(cleanup, /SystemRoot/);
  assert.match(cleanup, /Path\]::GetFullPath/);
  assert.match(cleanup, /ReparsePoint/);
  assert.match(cleanup, /\$failed -gt 0/);
  assert.match(cleanup, /result\.timedOut \|\| result\.code !== 0/);
});

test("SFC cannot call an ambiguous exit-code-zero repair healthy", () => {
  const repair = section("async function runSfc(", "function graded(");
  assert.match(repair, /classifySfc\(scan\.output, scan\.code\)/);
  assert.doesNotMatch(repair, /repaired\.grade === "healthy" \|\| scan\.code === 0/);
  assert.match(repair, /scan\.code !== 0/);
});

test("DISM reports no repair success after a failed stage", () => {
  const repair = section("async function runDism(", "function graded(");
  assert.match(repair, /check\.code !== 0/);
  assert.match(repair, /scan\.code !== 0/);
  assert.match(repair, /restore\.code !== 0/);
  assert.match(repair, /classifyDism\(\{ check: "", imageState: "", scan: scan\.output \}\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const build = readFileSync(new URL("../desktop/build.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/build-windows.yml", import.meta.url), "utf8");

test("installer artifact name is stable from build through release", () => {
  assert.match(build, /stamp\(stub, ico, "REcleaner\.Setup\.exe"\)/);
  assert.match(build, /artifacts\/REcleaner\.Setup\.exe/);
  assert.doesNotMatch(build, /REcleaner Setup\.exe/);
  assert.match(workflow, /artifacts\/REcleaner\.Setup\.exe/);
  assert.match(workflow, /sha256sum "REcleaner-win64\.zip" "REcleaner\.Setup\.exe" "REcleaner\.ico"/);
  assert.match(workflow, /sha256sum --check SHA256SUMS\.txt/);
  assert.doesNotMatch(workflow, /REcleaner Setup\.exe/);
});

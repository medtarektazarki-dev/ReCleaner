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

test("documentation uses the published installer filename", () => {
  for (const file of ["../README.md", "../docs/USER_GUIDE.md", "../docs/DEVELOPMENT.md"]) {
    const text = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(text, /REcleaner Setup\.exe/, file);
  }
});

test("the product version has a single source and is not hard-coded in the build or interface", () => {
  const build = readFileSync(new URL("../desktop/build.mjs", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/components/recleaner/app.tsx", import.meta.url), "utf8");
  const setup = readFileSync(new URL("../desktop/installer/setup/main.go", import.meta.url), "utf8");
  assert.doesNotMatch(build, /["']1\.0\.0["']/);
  assert.doesNotMatch(app, /v1\.0\.0/);
  assert.doesNotMatch(setup, /'1\.0\.0'/);
  assert.match(build, /package\.json/);
  assert.match(build, /-X main\.version=\$\{appVersion\}/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const main = readFileSync(new URL("../desktop/installer/uninstall/main.go", import.meta.url), "utf8");
const rules = readFileSync(new URL("../desktop/installer/uninstall/installdir.go", import.meta.url), "utf8");
const goTests = readFileSync(new URL("../desktop/installer/uninstall/installdir_test.go", import.meta.url), "utf8");

test("uninstaller only schedules deletion after the per-user installation folder check", () => {
  const guard = main.indexOf("installDirProblem(");
  const remove = main.indexOf("removeScript :=");
  assert.notEqual(guard, -1);
  assert.notEqual(remove, -1);
  assert.ok(guard < remove, "installation-location check must happen before scheduling folder deletion");
  assert.match(main, /localAppData|LOCALAPPDATA/);
});

test("the folder rules refuse portable copies, drive roots, and linked folders", () => {
  assert.match(rules, /filepath\.Join\(localAppData, "Programs", "REcleaner"\)/);
  assert.match(rules, /strings\.EqualFold\(actualDir, volumeRoot\)/);
  assert.match(rules, /os\.Lstat\(actualDir\)/);
  assert.match(rules, /os\.ModeSymlink\|os\.ModeIrregular/);
  assert.match(rules, /portable copy, close REcleaner and delete the extracted folder manually/);
});

test("those rules are exercised by Go tests that run in CI", () => {
  for (const name of ["TestPortableCopyIsNeverRemoved", "TestUnusualLocationsAreRefused", "TestInstallFolderThatIsALinkIsRefused"]) {
    assert.match(goTests, new RegExp(`func ${name}\\(`));
  }
  const quality = readFileSync(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");
  assert.match(quality, /go test \.\/\.\.\./);
});

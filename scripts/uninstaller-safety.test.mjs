import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../desktop/installer/uninstall/main.go", import.meta.url), "utf8");

test("uninstaller only removes the fixed per-user installation directory", () => {
  const guard = source.indexOf('if !strings.EqualFold(actualDir, expectedDir)');
  const remove = source.indexOf('removeScript :=');
  assert.notEqual(guard, -1);
  assert.notEqual(remove, -1);
  assert.ok(guard < remove, "installation-location check must happen before scheduling folder deletion");
  assert.match(source, /filepath\.Join\(localAppData, "Programs", "REcleaner"\)/);
  assert.match(source, /strings\.EqualFold\(actualDir, volumeRoot\)/);
  assert.match(source, /portable copy, close REcleaner and delete the extracted folder manually/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { MAX_PARAM_LENGTH, parseRunRequest } from "./request.ts";

test("a well-formed request passes through unchanged", () => {
  assert.deepEqual(parseRunRequest("user-add", { user: "bob", password: "x" }), { ok: true, actionId: "user-add", params: { user: "bob", password: "x" } });
  assert.deepEqual(parseRunRequest("host-read", undefined), { ok: true, actionId: "host-read", params: {} });
  assert.deepEqual(parseRunRequest("host-read", null), { ok: true, actionId: "host-read", params: {} });
});

test("action ids must be short lowercase identifiers", () => {
  for (const id of [undefined, null, 5, {}, [], "", "A", "a b", "a/b", "..", "cmd.exe", "a".repeat(65), "a;b"]) {
    assert.equal(parseRunRequest(id, {}).ok, false, JSON.stringify(id));
  }
});

test("parameters must be a small flat object of bounded strings", () => {
  assert.equal(parseRunRequest("x", "text").ok, false);
  assert.equal(parseRunRequest("x", ["a"]).ok, false);
  assert.equal(parseRunRequest("x", { user: 5 }).ok, false);
  assert.equal(parseRunRequest("x", { user: { nested: "a" } }).ok, false);
  assert.equal(parseRunRequest("x", { "bad key": "a" }).ok, false);
  assert.equal(parseRunRequest("x", { ["k".repeat(33)]: "a" }).ok, false);
  assert.equal(parseRunRequest("x", { user: "a".repeat(MAX_PARAM_LENGTH + 1) }).ok, false);
  assert.equal(parseRunRequest("x", { user: "a".repeat(MAX_PARAM_LENGTH) }).ok, true);
  const many = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`k${String.fromCharCode(97 + i)}`, "v"]));
  assert.equal(parseRunRequest("x", many).ok, false);
});

test("prototype pollution keys are not copied into the parameters", () => {
  const request = parseRunRequest("x", JSON.parse('{"__proto__": "a"}'));
  assert.equal(request.ok, false);
});

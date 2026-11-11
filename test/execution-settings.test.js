const test = require("node:test");
const assert = require("node:assert/strict");
const { codexExecution, applyExecutionPatch } = require("../src/chat/execution-settings");

test("existing automatic approvals keep their old boundary until an explicit choice", () => {
  const old = { autoApprove: true };
  assert.deepEqual(codexExecution(old), { sandbox: "danger-full-access", approval: "never", legacy: true });
  assert.deepEqual(old, { autoApprove: true });
  assert.equal(codexExecution({}).sandbox, "workspace-write");
  assert.equal(codexExecution(old, "workspace-read").sandbox, "read-only");
  const next = { ...old };
  applyExecutionPatch("codex", next, { codexSandbox: "workspace-write" }, "workspace-write");
  assert.equal(codexExecution(next).approval, "never");
  assert.equal(codexExecution(next).sandbox, "workspace-write");
  assert.equal(codexExecution(next).legacy, false);
});

test("unsupported environments cannot remove restrictions, and disabling bypass restores the workspace boundary", () => {
  for (const codexSandbox of [undefined, null, "", "external-sandbox", false]) {
    assert.throws(() => applyExecutionPatch("codex", { autoApprove: true }, { codexSandbox }, "workspace-write"));
  }
  assert.throws(() => applyExecutionPatch("claude", {}, { codexSandbox: "workspace-write" }, "workspace-write"));
  assert.throws(() => applyExecutionPatch("codex", {}, { codexSandbox: "workspace-write" }, "chat"));
  assert.throws(() => codexExecution({ autoApprove: false, codexSandbox: "danger-full-access" }));
  const next = { autoApprove: false, codexSandbox: "danger-full-access" };
  applyExecutionPatch("codex", next, { autoApprove: false }, "workspace-write");
  assert.equal(codexExecution(next).sandbox, "workspace-write");
});

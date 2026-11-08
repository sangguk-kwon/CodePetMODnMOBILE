const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const capabilities = require("../src/providers/provider-capabilities");
const approvalRunner = require("../src/chat/codex-approval-runner");
const runner = require("../src/chat/chat-agent-runner");
const { ChatStore } = require("../src/chat/chat-store");

const threadId = "11111111-2222-4333-8444-555555555555";
test("chat IPC answers a live Codex call and preserves session without enabling auto approval", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codepet-live-approval-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const record = { id: "codex", name: "Codex", status: "cli", commandPath: "fixture", catalogStatus: "ready",
    modelOptions: [{ id: "fixture" }], permissions: { "workspace-write": { supported: true }, chat: { supported: true } } };
  t.mock.method(capabilities, "createCapabilityService", () => ({ defs: [record], getRecord: id => id === "codex" ? record : null, discover: async () => [record] }));
  t.mock.method(runner, "runAgentProcess", () => { throw new Error("must not restart as exec"); });
  const calls = [];
  t.mock.method(approvalRunner, "runCodexApprovalTurn", input => {
    calls.push(input);
    const controller = new AbortController();
    input.parseLine(JSON.stringify({ type: "thread.started", thread_id: threadId }));
    const promise = input.requestApproval({ summary: "fixture command", detail: "echo fixture", signal: controller.signal })
      .then(approved => ({ ok: true, text: approved ? "allowed" : "denied", appliedPermissions: {
        approval: "on-request", sandbox: "workspaceWrite", verifiedAt: 1 } }));
    return { promise, cancel: () => controller.abort() };
  });
  const store = new ChatStore({ root: path.join(root, "store") }).init();
  t.after(() => store.close());
  const session = store.createSession({});
  const other = store.createSession({});
  store.patchConfig({ activeSessionId: session.id });
  store.updateMeta(session.id, { permissionMode: "workspace-write", workspace: root });
  const modulePath = require.resolve("../src/chat/chat-ipc"); delete require.cache[modulePath];
  t.after(() => { delete require.cache[modulePath]; });
  const handlers = new Map();
  const feature = require(modulePath).createChatFeature({ store, platform: "linux", env: { CODEX_HOME: path.join(root, "source") },
    electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} }, dialog: {}, shell: {}, BrowserWindow: class {} } });
  t.after(() => feature.shutdown()); feature.registerIpcHandlers();
  const invoke = (name, payload) => handlers.get(name)({}, payload);
  const state = () => invoke("chat:state");
  async function until(check) {
    for (let i = 0; i < 100; i++) { const current = await state(); if (check(current)) return current; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail("chat state timed out");
  }
  await state();
  for (const decision of ["approve", "deny"]) {
    await invoke("chat:send", { sessionId: session.id, text: "@codex run" });
    const current = await until(data => data.session.pendingCallApprovals.length === 1);
    const request = current.session.pendingCallApprovals[0];
    assert.equal(request.retryScope, "call");
    assert.equal((await invoke("chat:approval:respond", { sessionId: other.id, approvalId: request.approvalId, decision })).ok, false);
    assert.equal((await invoke("chat:approval:respond", { sessionId: session.id, approvalId: request.approvalId, decision })).ok, true);
    assert.equal((await invoke("chat:approval:respond", { sessionId: session.id, approvalId: request.approvalId, decision })).ok, false);
    const finished = await until(data => !data.session.turnState.current && data.session.pendingCallApprovals.length === 0);
    assert.equal(finished.session.messages.at(-1).text, decision === "approve" ? "allowed" : "denied");
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].cliSessionId, null); assert.equal(calls[1].cliSessionId, threadId);
  assert.ok(calls.every(call => !call.argv.join(" ").includes("bypass")));
  assert.ok(!store.readMeta(session.id).agents?.codex?.autoApprove);
  const diagnostic = await invoke("chat:agent:permissions", { sessionId: session.id, agentId: "codex" });
  assert.equal(diagnostic.diagnostics.launch.approval, "on-request");
  assert.equal(diagnostic.diagnostics.lastApplied.sandbox, "workspaceWrite");
});

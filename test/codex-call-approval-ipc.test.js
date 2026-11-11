const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const capabilities = require("../src/providers/provider-capabilities");
const approvalRunner = require("../src/chat/codex-approval-runner");
const claudeRunner = require("../src/chat/claude-approval-runner");
const runner = require("../src/chat/chat-agent-runner");
const { ChatStore } = require("../src/chat/chat-store");

const threadId = "11111111-2222-4333-8444-555555555555";
for (const providerId of ["codex", "claude"]) test(`chat IPC answers a live ${providerId} call and preserves its session and rules`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codepet-live-approval-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const record = { id: providerId, name: providerId, status: "cli", commandPath: "fixture", catalogStatus: "ready",
    modelOptions: [{ id: "fixture" }], permissions: { "workspace-write": { supported: true }, chat: { supported: true } } };
  t.mock.method(capabilities, "createCapabilityService", () => ({ defs: [record], getRecord: id => id === providerId ? record : null, discover: async () => [record] }));
  t.mock.method(runner, "runAgentProcess", () => { throw new Error("must not restart as exec"); });
  const calls = [];
  t.mock.method(providerId === "codex" ? approvalRunner : claudeRunner, providerId === "codex" ? "runCodexApprovalTurn" : "runClaudeApprovalTurn", input => {
    calls.push(input);
    const controller = new AbortController();
    input.parseLine(JSON.stringify(providerId === "codex" ? { type: "thread.started", thread_id: threadId }
      : { type: "system", subtype: "init", session_id: threadId }));
    const promise = input.requestApproval({ summary: "fixture command", detail: "echo fixture", signal: controller.signal,
      target: { kind: "command", command: "echo fixture", cwd: root } })
      .then(approved => ({ ok: true, text: approved ? "allowed" : "denied", appliedPermissions: {
        approval: providerId === "codex" ? "on-request" : "default", sandbox: "workspaceWrite", verifiedAt: 1 } }));
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
    await invoke("chat:send", { sessionId: session.id, text: `@${providerId} run` });
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
  if (providerId === "codex") { assert.equal(calls[0].cliSessionId, null); assert.equal(calls[1].cliSessionId, threadId); }
  else { assert.ok(!calls[0].argv.includes("--resume")); assert.equal(calls[1].argv[calls[1].argv.indexOf("--resume") + 1], threadId); }
  assert.ok(calls.every(call => !call.argv.join(" ").includes("bypass")));
  assert.ok(!store.readMeta(session.id).agents?.[providerId]?.autoApprove);
  const diagnostic = await invoke("chat:agent:permissions", { sessionId: session.id, agentId: providerId });
  assert.equal(diagnostic.diagnostics.launch.approval, providerId === "codex" ? "on-request" : "default");
  assert.equal(diagnostic.diagnostics.lastApplied.sandbox, "workspaceWrite");
  for (const effect of ["allow", "deny"]) {
    const current = await invoke("chat:tools:get", { sessionId: session.id, agentId: providerId });
    assert.equal((await invoke("chat:tools:save", { sessionId: session.id, agentId: providerId, revision: current.revision,
      settings: { ...current.settings, rules: [{ id: "fixture", kind: "command", effect, match: "echo fixture" }] } })).ok, true);
    await invoke("chat:send", { sessionId: session.id, text: `@${providerId} rule` });
    const finished = await until(data => !data.session.turnState.current && data.session.pendingCallApprovals.length === 0);
    assert.equal(finished.session.messages.at(-1).text, effect === "allow" ? "allowed" : "denied");
  }
  assert.equal(calls.length, 4);
  const initial = await invoke("chat:tools:get", { sessionId: session.id, agentId: providerId });
  await invoke("chat:tools:save", { sessionId: session.id, agentId: providerId, revision: initial.revision, settings: { ...initial.settings, rules: [] } });
  await invoke("chat:send", { sessionId: session.id, text: `@${providerId} remember` });
  const pending = await until(data => data.session.pendingCallApprovals.length === 1);
  const approval = pending.session.pendingCallApprovals[0];
  assert.match(approval.conversationLabel, /같은 명령/);
  assert.equal((await invoke("chat:approval:respond", { sessionId: session.id, approvalId: approval.approvalId, decision: "approve-conversation" })).ok, true);
  await until(data => !data.session.turnState.current);
  const grants = await invoke("chat:grants:list", { sessionId: session.id, agentId: providerId });
  assert.equal(grants.grants.length, 1);
  await invoke("chat:send", { sessionId: session.id, text: `@${providerId} repeat` });
  await until(data => !data.session.turnState.current && calls.length === 6);
  assert.equal((await state()).session.pendingCallApprovals.length, 0);
  assert.equal((await invoke("chat:grants:remove", { sessionId: session.id, agentId: providerId, id: grants.grants[0].id, scope: "stale" })).ok, false);
  assert.equal((await invoke("chat:grants:remove", { sessionId: session.id, agentId: providerId, id: grants.grants[0].id, scope: grants.scope })).ok, true);
  await invoke("chat:send", { sessionId: session.id, text: `@${providerId} after revoke` });
  const again = await until(data => data.session.pendingCallApprovals.length === 1);
  await invoke("chat:approval:respond", { sessionId: session.id, approvalId: again.session.pendingCallApprovals[0].approvalId, decision: "deny" });
  await until(data => !data.session.turnState.current);
});

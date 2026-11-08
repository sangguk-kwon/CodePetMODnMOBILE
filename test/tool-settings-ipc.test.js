const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const capabilities = require("../src/providers/provider-capabilities");
const approvalRunner = require("../src/chat/codex-approval-runner");
const runner = require("../src/chat/chat-agent-runner");
const { ChatStore } = require("../src/chat/chat-store");

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-tool-ipc-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const records = ["codex", "claude"].map(id => ({ id, name: id, status: "cli", commandPath: "fixture", catalogStatus: "ready",
    modelOptions: [{ id: "fixture" }], permissions: Object.fromEntries(["chat", "workspace-read", "workspace-write"].map(mode => [mode, { supported: true }])) }));
  t.mock.method(capabilities, "createCapabilityService", () => ({ defs: records, getRecord: id => records.find(record => record.id === id), discover: async () => records }));
  const calls = [];
  t.mock.method(approvalRunner, "runCodexApprovalTurn", input => {
    calls.push(input);
    const controller = new AbortController();
    input.parseLine(JSON.stringify({ type: "thread.started", thread_id: "11111111-2222-4333-8444-555555555555" }));
    const promise = input.requestApproval({ summary: "command", detail: "redacted preview", signal: controller.signal,
      target: { kind: "command", command: "echo exact", cwd: input.cwd } }).then(allow => ({ ok: true, text: allow ? "allowed" : "denied" }));
    return { promise, cancel: () => controller.abort() };
  });
  const executions = [];
  t.mock.method(runner, "runAgentProcess", input => { executions.push(input); return { promise: Promise.resolve({ ok: true, text: "done" }), cancel() {} }; });
  const store = new ChatStore({ root: path.join(root, "store") }).init();
  const session = store.createSession({}), other = store.createSession({});
  store.patchConfig({ activeSessionId: session.id });
  for (const item of [session, other]) store.updateMeta(item.id, { workspace: root, permissionMode: "workspace-write" });
  const modulePath = require.resolve("../src/chat/chat-ipc"); delete require.cache[modulePath];
  t.after(() => { delete require.cache[modulePath]; });
  const handlers = new Map();
  const feature = require(modulePath).createChatFeature({ store, platform: "linux", env: { CODEX_HOME: path.join(root, "home"), CLAUDE_CONFIG_DIR: path.join(root, "claude-home") },
    electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} }, dialog: {}, shell: {}, BrowserWindow: class {} } });
  t.after(() => feature.shutdown()); feature.registerIpcHandlers();
  const invoke = (name, payload) => handlers.get(name)({}, payload);
  const get = (agentId = "codex", sessionId = session.id) => invoke("chat:tools:get", { sessionId, agentId });
  const save = (data, agentId = "codex", sessionId = session.id) => invoke("chat:tools:save", { sessionId, agentId, ...data });
  const state = () => invoke("chat:state");
  async function until(check) {
    for (let i = 0; i < 200; i++) { const current = await state(); if (check(current.session)) return current.session; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.fail("state did not settle");
  }
  await state();
  return { root, store, session, other, invoke, get, save, state, until, calls, executions };
}

test("common settings IPC shares only the account/workspace scope, rejects stale and unsupported changes", async t => {
  const f = await fixture(t), initial = await f.get();
  const rule = { id: "exact", kind: "command", effect: "allow", match: "echo exact" };
  const saved = await f.save({ settings: { ...initial.settings, rules: [rule] }, revision: initial.revision });
  assert.equal(saved.ok, true);
  assert.deepEqual((await f.get("codex", f.other.id)).settings, saved.settings);
  assert.equal((await f.save({ settings: initial.settings, revision: initial.revision })).ok, false);
  assert.equal((await f.invoke("chat:agent:configure", { sessionId: f.session.id, agentId: "codex", patch: { autoApprove: true } })).ok, false);
  assert.deepEqual((await f.get("claude")).settings.rules, []);
  const claude = await f.get("claude");
  assert.equal((await f.save({ settings: { ...claude.settings, rules: [rule] }, revision: claude.revision }, "claude")).ok, false);
  f.store.updateMeta(f.other.id, { workspace: path.join(f.root, "other-workspace") });
  assert.deepEqual((await f.get("codex", f.other.id)).settings.rules, []);
  assert.equal((await f.invoke("chat:tools:get", { sessionId: f.session.id, agentId: "unknown" })).ok, false);
});

test("persisted exact command rules decide live Codex calls without a dialog, bypass or whole-turn replay", async t => {
  const f = await fixture(t);
  for (const effect of ["allow", "deny"]) {
    const initial = await f.get();
    const settings = { ...initial.settings, rules: [{ id: "exact", kind: "command", effect, match: "echo exact" }] };
    assert.equal((await f.save({ settings, revision: initial.revision })).ok, true);
    await f.invoke("chat:send", { sessionId: f.session.id, text: "@codex run" });
    const finished = await f.until(session => !session.turnState.current && session.messages.at(-1)?.author === "codex"
      && session.messages.at(-1)?.text === (effect === "allow" ? "allowed" : "denied"));
    assert.equal(finished.pendingCallApprovals.length, 0);
  }
  assert.equal(f.calls.length, 2); assert.equal(f.executions.length, 0);
  assert.ok(f.calls.every(call => !call.argv.join(" ").includes("bypass")));
  assert.ok(!f.store.readMeta(f.session.id).agents?.codex?.autoApprove);
  const eventText = f.store.readTranscript(f.session.id).filter(event => event.kind === "tool-rule-decision").map(event => JSON.stringify(event)).join("\n");
  assert.match(eventText, /tool-rule-decision/);
  assert.doesNotMatch(eventText, /echo exact/);
});

test("unmatched calls still prompt; shared-scope edits are blocked during execution and allowed after stop", async t => {
  const f = await fixture(t), initial = await f.get();
  await f.invoke("chat:send", { sessionId: f.session.id, text: "@codex run" });
  const pending = await f.until(session => session.pendingCallApprovals.length === 1);
  const blocked = await f.save({ settings: initial.settings, revision: initial.revision }, "codex", f.other.id);
  assert.equal(blocked.ok, false); assert.match(blocked.error, /실행 중/);
  assert.equal((await f.invoke("chat:approval:respond", { sessionId: f.session.id,
    approvalId: pending.pendingCallApprovals[0].approvalId, decision: "deny" })).ok, true);
  await f.until(session => !session.turnState.current);
  assert.equal((await f.save({ settings: initial.settings, revision: initial.revision })).ok, true);
});

test("Claude tool settings reach initial/resumed launch arguments and never change global CLI config", async t => {
  const f = await fixture(t), initial = await f.get("claude");
  const saved = await f.save({ settings: { ...initial.settings, tools: { Bash: false, WebSearch: false } }, revision: initial.revision }, "claude");
  assert.equal(saved.ok, true);
  await f.invoke("chat:send", { sessionId: f.session.id, text: "@claude inspect" });
  await f.until(session => !session.turnState.current && session.messages.at(-1)?.author === "claude");
  assert.equal(f.executions.length, 1);
  assert.ok(f.executions[0].argv.includes("--disallowedTools"));
  assert.equal(f.executions[0].argv[f.executions[0].argv.indexOf("--disallowedTools") + 1], "Bash,WebSearch");
  assert.ok(f.executions[0].argv.includes("--strict-mcp-config"));
  assert.equal(fs.existsSync(path.join(f.root, "claude-home", "settings.json")), false);
});

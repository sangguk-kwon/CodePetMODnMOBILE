const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const { EventEmitter } = require("node:events");
const { runCodexApprovalTurn } = require("../src/chat/codex-approval-runner");
const { createLineParser } = require("../src/chat/chat-events");

const threadId = "11111111-2222-4333-8444-555555555555", turnId = "turn-1";
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(extra = {}) {
  const rpc = new EventEmitter(), sent = [], calls = [], traces = [], events = [];
  const cwd = os.tmpdir();
  rpc.closed = false;
  rpc.initialize = async () => {};
  rpc.close = () => { rpc.closed = true; rpc.emit("closed", new Error("closed")); };
  rpc.send = value => sent.push(value);
  rpc.request = async (method, params) => {
    calls.push({ method, params });
    if (method === "config/read") return { config: { approval_policy: "never", api_key: "secret-config" }, origins: {} };
    if (method === "permissionProfile/list") return extra.profiles || {};
    if (method.startsWith("thread/")) return { thread: { id: threadId }, cwd, model: "fixture", approvalsReviewer: "user",
      approvalPolicy: "on-request", sandbox: { type: "workspaceWrite" }, ...extra.threadResponse };
    if (method === "turn/start") {
      rpc.emit("notification", { method: "turn/started", params: { threadId, turn: { id: turnId } } });
      return { turn: { id: turnId } };
    }
    return {};
  };
  const pending = [];
  const run = runCodexApprovalTurn({ commandPath: "fixture", cwd, prompt: "test", parseLine: createLineParser("codex", event => traces.push(event)),
    onEvent: event => events.push(event), requestApproval: input => new Promise(resolve => pending.push({ input, resolve })),
    rpcFactory: () => rpc, ...extra });
  const notice = (method, params = {}) => rpc.emit("notification", { method, params: { threadId, turnId, ...params } });
  const request = (id, method = "item/commandExecution/requestApproval", params = {}) => rpc.emit("request", {
    id, method, params: { threadId, turnId, itemId: `item-${id}`, command: "echo harmless", ...params } });
  function complete() {
    notice("item/completed", { item: { type: "agentMessage", id: "answer", text: "done" } });
    notice("turn/completed", { turn: { id: turnId, status: "completed" } });
  }
  return { run, rpc, sent, calls, pending, notice, request, complete, traces, events };
}

test("a live approval accepts exactly one request without replay, widening sandbox or persisting a rule", async () => {
  const f = fixture(); await tick();
  f.request(91); await tick();
  assert.equal(f.pending.length, 1); assert.equal(f.sent.length, 0);
  f.pending[0].resolve(true); await tick();
  assert.deepEqual(f.sent, [{ id: 91, result: { decision: "accept" } }]);
  f.request(91); assert.equal(f.pending.length, 1);
  const turn = f.calls.find(call => call.method === "turn/start");
  assert.equal(turn.params.sandboxPolicy.type, "workspaceWrite");
  assert.equal(turn.params.sandboxPolicy.networkAccess, false);
  assert.equal(turn.params.approvalsReviewer, "user");
  assert.equal(f.calls.filter(call => call.method === "turn/start").length, 1);
  f.complete(); const result = await f.run.promise;
  assert.equal(result.ok, true); assert.equal(result.text, "done");
  assert.equal(result.appliedPermissions.approval, "on-request");
  assert.equal(result.appliedPermissions.configured.approval_policy.value, "never");
  assert.doesNotMatch(JSON.stringify(result), /secret-config/);
});

test("file decisions, stale turn rejection and unsupported permission grants remain scoped", async () => {
  const f = fixture(); await tick();
  f.notice("item/started", { item: { id: "item-1", type: "fileChange", changes: [{ path: "fixture.js", diff: "secret-file-body" }] } });
  f.request(1, "item/fileChange/requestApproval"); await tick();
  assert.match(f.pending[0].input.detail, /fixture.js/);
  assert.doesNotMatch(f.pending[0].input.detail, /secret-file-body/);
  f.pending[0].resolve(false); await tick();
  assert.deepEqual(f.sent[0].result, { decision: "decline" });
  f.request(2, undefined, { turnId: "wrong-turn" });
  assert.equal(f.pending.length, 1); assert.equal(f.sent[1].error.code, -32602);
  f.request(3, "item/permissions/requestApproval", { permissions: { fileSystem: { write: ["/"] } } });
  assert.deepEqual(f.sent[2].result, { permissions: {}, scope: "turn" });
  f.complete(); await f.run.promise;
});

test("cancel and server-resolved requests abort waiting approvals; late clicks cannot execute", async () => {
  const f = fixture(); await tick(); f.request(1); await tick();
  f.notice("serverRequest/resolved", { requestId: 1 });
  assert.equal(f.pending[0].input.signal.aborted, true);
  f.pending[0].resolve(true); await tick(); assert.equal(f.sent.length, 0);
  f.request(2); await tick(); f.run.cancel();
  assert.equal(f.pending[1].input.signal.aborted, true);
  f.pending[1].resolve(true); await tick();
  assert.equal(f.sent.length, 0);
  assert.equal((await f.run.promise).cancelled, true);
});

test("resumes the same thread; sandbox/reviewer mismatch fails before starting a turn", async () => {
  const resumed = fixture({ cliSessionId: threadId, model: "fixture-next", effort: "high" }); await tick();
  assert.equal(resumed.calls.find(call => call.method === "thread/resume").params.threadId, threadId);
  assert.equal(resumed.calls.find(call => call.method === "turn/start").params.effort, "high");
  resumed.complete(); await resumed.run.promise;
  for (const threadResponse of [{ sandbox: { type: "dangerFullAccess" } }, { approvalPolicy: "never" }, { approvalsReviewer: "auto_review" }]) {
    const f = fixture({ threadResponse });
    assert.equal((await f.run.promise).ok, false);
    assert.ok(!f.calls.some(call => call.method === "turn/start"));
  }
});

test("errors and reasoning metadata preserve lifecycle without exposing reasoning content", async () => {
  const f = fixture(); await tick();
  f.notice("item/started", { item: { id: "reason", type: "reasoning", content: ["private-reason"], summary: ["private-summary"] } });
  f.notice("item/agentMessage/delta", { delta: "public reply" });
  f.notice("turn/completed", { turn: { id: turnId, status: "failed", error: { message: "fixture failure" } } });
  const result = await f.run.promise;
  assert.equal(result.ok, false); assert.match(result.error, /fixture failure/);
  assert.doesNotMatch(JSON.stringify([f.traces, f.events]), /private-reason|private-summary/);
});

test("named permission profiles are capability-checked and never combined with legacy sandbox overrides", async () => {
  const f = fixture({ profiles: { data: [{ id: ":workspace", allowed: true }] } }); await tick();
  const thread = f.calls.find(call => call.method === "thread/start").params;
  const turn = f.calls.find(call => call.method === "turn/start").params;
  assert.equal(thread.permissions, ":workspace"); assert.equal(thread.sandbox, undefined);
  assert.equal(turn.permissions, ":workspace"); assert.equal(turn.sandboxPolicy, undefined);
  f.complete(); await f.run.promise;
  const denied = fixture({ profiles: { data: [{ id: ":workspace", allowed: false }] } });
  assert.equal((await denied.run.promise).ok, false);
  assert.ok(!denied.calls.some(call => call.method === "thread/start"));
});

test("a declined call that interrupts Codex remains a visible denial; targetless calls are never offered", async () => {
  const f = fixture(); await tick();
  f.request(1, undefined, { command: null });
  assert.deepEqual(f.sent[0].result, { decision: "decline" });
  assert.equal(f.pending.length, 0);
  f.request(2); await tick(); f.pending[0].resolve(false); await tick();
  f.notice("turn/completed", { turn: { id: turnId, status: "interrupted" } });
  const result = await f.run.promise;
  assert.equal(result.status, "denied"); assert.ok(!result.cancelled);
  assert.match(result.error, /거부/);
});

test("automatic approval keeps workspace sandbox and rejects unexpected escalation without a dialog", async () => {
  const f = fixture({ autoApprove: true, threadResponse: { approvalPolicy: "never" } }); await tick();
  const thread = f.calls.find(call => call.method === "thread/start").params;
  const turn = f.calls.find(call => call.method === "turn/start").params;
  assert.equal(thread.approvalPolicy, "never"); assert.equal(turn.approvalPolicy, "never");
  assert.equal(turn.sandboxPolicy.type, "workspaceWrite"); assert.equal(turn.sandboxPolicy.networkAccess, false);
  f.request(1); f.request(2, "item/permissions/requestApproval"); await tick();
  assert.equal(f.pending.length, 0);
  assert.deepEqual(f.sent.map(item => item.result), [{ decision: "decline" }, { permissions: {}, scope: "turn" }]);
  f.complete(); const result = await f.run.promise;
  assert.equal(result.ok, true); assert.equal(result.appliedPermissions.approval, "never");
  assert.equal(result.diagnostics.autoApprove, true);
  const mismatched = fixture({ autoApprove: true });
  assert.equal((await mismatched.run.promise).ok, false);
  assert.ok(!mismatched.calls.some(call => call.method === "turn/start"));
});

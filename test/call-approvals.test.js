const test = require("node:test");
const assert = require("node:assert/strict");
const { CallApprovals } = require("../src/chat/call-approvals");

test("call approvals are bound to session/request; duplicates and invalid decisions cannot grant", async () => {
  const events = [], approvals = new CallApprovals({ emit: (kind, data) => events.push({ kind, data }) });
  const pending = approvals.request({ sessionId: "a", agentId: "codex", runId: "r1", summary: "command" });
  const [{ approvalId }] = approvals.list("a");
  assert.equal(approvals.respond("b", approvalId, "approve"), false);
  assert.equal(approvals.respond("a", approvalId, "approve-all"), false);
  assert.equal(approvals.respond("a", approvalId, "approve"), true);
  assert.equal(await pending, true);
  assert.equal(approvals.respond("a", approvalId, "approve"), false);
  assert.deepEqual(approvals.list("a"), []);
  assert.deepEqual(events.map(event => event.kind), ["request", "resolved"]);
});

test("settings changes, cancellation and expiry deny only their own requests", async () => {
  const approvals = new CallApprovals({ emit() {}, timeoutMs: 10 });
  let current = true;
  const first = approvals.request({ sessionId: "a", isCurrent: () => current });
  current = false;
  assert.equal(approvals.respond("a", approvals.list("a")[0].approvalId, "approve"), false);
  assert.equal(await first, false);
  const controller = new AbortController();
  const second = approvals.request({ sessionId: "a", signal: controller.signal });
  const third = approvals.request({ sessionId: "b" });
  controller.abort();
  assert.equal(await second, false);
  assert.equal(approvals.list("b").length, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(await third, false);
  assert.deepEqual(approvals.list("b"), []);
  const last = approvals.request({ sessionId: "a" });
  approvals.close();
  assert.equal(await last, false);
});

test("conversation approval is offered only with a save callback and never executes after a failed save", async () => {
  const broker = new CallApprovals({ emit() {} }); let saved = false;
  const promise = broker.request({ sessionId: "s", conversationLabel: "same command", onConversation: () => {
    if (!saved) throw Error("disk failure");
  } });
  const request = broker.list("s")[0];
  assert.equal(request.conversationLabel, "same command");
  assert.throws(() => broker.respond("s", request.approvalId, "approve-conversation"), /disk failure/);
  assert.equal(broker.list("s").length, 1);
  saved = true; assert.ok(broker.respond("s", request.approvalId, "approve-conversation"));
  assert.equal(await promise, true);
  const once = broker.request({ sessionId: "s" }), id = broker.list("s")[0].approvalId;
  assert.equal(broker.respond("s", id, "approve-conversation"), false);
  broker.close(); assert.equal(await once, false);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLineParser } = require("../src/chat/chat-events");
const { ChatRoom } = require("../src/chat/chat-room");
const { buildAgentPrompt } = require("../src/chat/chat-prompt");

test("public messages exclude child agents/reasoning/tool output and deduplicate CLI summaries", () => {
  for (const provider of ["claude", "codex"]) {
    const messages = [];
    const parser = createLineParser(provider, null, null, null, null, e => messages.push(e));
    const publicEvent = provider === "claude"
      ? { type: "assistant", message: { id: "one", content: [{ type: "text", text: "Checking files." }, { type: "thinking", thinking: "PRIVATE" }] } }
      : { type: "item.completed", item: { type: "agent_message", id: "one", phase: "commentary", text: "Checking files." } };
    for (const e of [publicEvent, publicEvent, { ...publicEvent, parent_tool_use_id: "child", message: { content: [{ type: "text", text: "CHILD" }] } },
      { type: "item.completed", item: { type: "reasoning", text: "PRIVATE" } },
      { type: "user", message: { content: [{ type: "tool_result", content: "SECRET_TOOL_OUTPUT" }] } }]) parser(JSON.stringify(e));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "Checking files.");
    assert.doesNotMatch(JSON.stringify(messages), /PRIVATE|CHILD|SECRET_TOOL/);
    assert.equal(parser(JSON.stringify({ ...publicEvent, parent_tool_use_id: "child" })), null);
  }
});

test("public reports redact known secrets and keep Codex commentary out of the final answer", () => {
  const messages = [], parser = createLineParser("codex", null, null, null, null, e => messages.push(e));
  assert.equal(parser(JSON.stringify({ type: "item.completed", item: { id: "mid", type: "agent_message", phase: "commentary", text: "Authorization: Bearer abc-secret-123456789" } })), null);
  assert.doesNotMatch(messages[0].text, /abc-secret/);
  assert.equal(parser(JSON.stringify({ type: "item.completed", item: { id: "final", type: "agent_message", phase: "final_answer", text: "Done." } })).text, "Done.");
});

function roomFixture(provider) {
  let emit, finish;
  const agent = { id: provider, providerId: provider, name: provider, aliases: [provider], enabled: true, available: true };
  const room = new ChatRoom({ agents: [agent], runAgent: options => {
    emit = options.emitEvent;
    return { promise: new Promise(resolve => { finish = resolve; }), cancel() { finish({ ok: false, cancelled: true }); } };
  } });
  room.sendUserMessage(`@${provider} test`);
  const parser = createLineParser(provider, null, null, null, e => emit({ kind: "progress", ...e }), e => emit(e));
  return { room, emit, parser: e => { const event = parser(JSON.stringify(e)); if (event) emit(event); }, finish: value => finish(value) };
}

test("Claude public text before tools is saved once, final text stays final and reports do not enter prompts", async () => {
  const f = roomFixture("claude");
  const assistant = (id, text) => ({ type: "assistant", message: { id, content: [{ type: "text", text }] } });
  f.parser(assistant("first", "Looking at files."));
  assert.equal(f.room.messages.length, 1, "hold the last text until its role is known");
  f.parser({ type: "assistant", message: { id: "tool", content: [{ type: "tool_use", id: "read", name: "Read", input: {} }] } });
  assert.equal(f.room.messages.at(-1).messageKind, "commentary");
  f.parser(assistant("next", "Found an error; fixing it."));
  f.parser({ type: "assistant", message: { id: "tool2", content: [{ type: "tool_use", id: "edit", name: "Edit", input: {} }] } });
  f.parser(assistant("final", "Fixed and tested."));
  f.finish({ ok: true, text: "Fixed and tested." }); await f.room.waitForIdle();
  assert.deepEqual(f.room.messages.filter(m => m.authorType === "agent").map(m => [m.messageKind || "final", m.text]),
    [["commentary", "Looking at files."], ["commentary", "Found an error; fixing it."], ["final", "Fixed and tested."]]);
  const prompt = buildAgentPrompt({ agent: f.room.agents[0], agents: f.room.agents, messages: f.room.messages });
  assert.doesNotMatch(prompt, /Looking at files\.|Found an error;/); assert.match(prompt, /Fixed and tested/);
});

test("Codex commentary is immediate, does not trigger mentions and survives cancellation/late events", async () => {
  const f = roomFixture("codex");
  f.parser({ type: "item.completed", item: { id: "middle", type: "agent_message", phase: "commentary", text: "@claude checking now." } });
  assert.equal(f.room.messages.at(-1).messageKind, "commentary");
  assert.equal(f.room.messages.at(-1).text, "@claude checking now.");
  f.room.stopAll();
  f.emit({ kind: "public-complete", messageId: "late", phase: "commentary", text: "STALE" });
  f.finish({ ok: true, text: "STALE" }); await f.room.waitForIdle();
  assert.doesNotMatch(JSON.stringify(f.room.messages), /STALE/);
  assert.equal(f.room.messages.filter(m => m.authorType === "agent").length, 1);
});

test("failures keep earlier reports and the final error on the same run", async () => {
  const f = roomFixture("codex");
  f.parser({ type: "item.completed", item: { id: "m", type: "agent_message", phase: "commentary", text: "Checking." } });
  f.finish({ ok: false, error: "Fixture failure", text: "" }); await f.room.waitForIdle();
  const messages = f.room.messages.filter(m => m.authorType === "agent");
  assert.equal(messages.length, 2); assert.equal(messages[0].messageKind, "commentary");
  assert.equal(messages[0].runId, messages[1].runId); assert.equal(messages[1].error, true);
});

test("parallel agents keep separate reports and no intermediate mentions schedule extra runs", async () => {
  const callbacks = new Map();
  const agents = ["claude", "codex"].map(id => ({ id, name: id, aliases: [id], available: true, enabled: true }));
  const room = new ChatRoom({ agents, runAgent: ({ agent, emitEvent }) => ({
    promise: new Promise(resolve => callbacks.set(agent.id, { emitEvent, resolve })), cancel() {} }) });
  room.sendUserMessage("Work together");
  for (const id of ["codex", "claude"]) {
    callbacks.get(id).emitEvent({ kind: "public-complete", messageId: id, phase: "commentary", text: `@${id === "codex" ? "claude" : "codex"} checking.` });
  }
  assert.equal(callbacks.size, 2); assert.equal(room.messages.filter(m => m.messageKind === "commentary").length, 2);
  for (const [id, c] of callbacks) c.resolve({ ok: true, text: `${id} done.` });
  await room.waitForIdle();
  const reports = room.messages.filter(m => m.messageKind === "commentary");
  assert.notEqual(reports[0].runId, reports[1].runId);
  for (const report of reports) assert.equal(report.runId, room.messages.find(m => m.author === report.author && !m.messageKind).runId);
  assert.equal(room.messages.filter(m => m.authorType === "agent").length, 4);
});

test("report history does not consume recovery budgets or replay through another agent's cursor", t => {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { readMessageRange, readRecoveryContext } = require("../src/chat/chat-history");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-public-history-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "transcript.jsonl");
  const messages = [
    { id: "u1", authorType: "user", text: "first" },
    { id: "report", authorType: "agent", author: "claude", messageKind: "commentary", text: "x".repeat(10000) },
    { id: "answer", authorType: "agent", author: "claude", text: "final" },
    { id: "u2", authorType: "user", text: "next" },
  ];
  fs.writeFileSync(file, messages.map(message => JSON.stringify({ kind: "message", message })).join("\n") + "\n");
  assert.deepEqual(readMessageRange(file, { afterId: "u1", throughId: "u2", agentId: "codex" }).map(m => m.id), ["answer", "u2"]);
  const recovered = readRecoveryContext(file, { throughId: "u2", maxBytes: 1000 });
  assert.equal(recovered.truncated, false); assert.deepEqual(recovered.messages.map(m => m.id), ["u1", "answer", "u2"]);
});

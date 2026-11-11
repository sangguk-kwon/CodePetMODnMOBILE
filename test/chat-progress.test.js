const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { progressEvents, ProgressHistory, MAX_ROWS, MAX_RUNS, testCommand } = require("../src/chat/chat-progress");
const { createLineParser } = require("../src/chat/chat-events");
const { ChatStore } = require("../src/chat/chat-store");
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-progress-")), store = new ChatStore({ root }).init();
  const session = store.createSession({}), emitted = [], history = new ProgressHistory(store, e => emitted.push(e));
  t.after(() => { history.close(); store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, store, session, emitted, history };
}
test("Claude stream/assistant duplicates join their result without exposing inputs, outputs or reasoning", t => {
  const f = fixture(t); f.history.start(f.session.id, "r1", "claude");
  const parse = createLineParser("claude", null, null, null, e => f.history.update(f.session.id, "r1", e));
  parse(JSON.stringify({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", id: "id1", name: "Read" } } }));
  parse(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", id: "id1", name: "Read", input: { file_path: "secret-path" } }, { type: "thinking", thinking: "private-thought" }] } }));
  parse(JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "id1", content: "secret-output" }] } }));
  let [run] = f.history.list(f.session.id);
  assert.equal(run.rows.length, 1); assert.equal(run.rows[0].category, "read"); assert.equal(run.rows[0].state, "completed");
  f.history.finish(f.session.id, "r1", "completed");
  assert.doesNotMatch(JSON.stringify(f.history.list(f.session.id)), /secret-path|secret-output|private-thought/);
  const metadata = progressEvents("claude", { type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking", thinking: "private-thought" } } });
  assert.equal(metadata[0].category, "thinking"); assert.doesNotMatch(JSON.stringify(metadata), /private-thought/);
  assert.doesNotThrow(() => progressEvents("claude", { type: "assistant", message: { content: [{ type: "tool_use", id: "x", name: { toString: null } }] } }));
  const optional = createLineParser("claude", null, null, null, () => { throw Error("UI unavailable"); });
  assert.equal(optional(JSON.stringify({ type: "result", subtype: "success", result: "final" })).text, "final");
});
test("Codex exit codes and incomplete tools preserve evidence; run completion never implies tool success", t => {
  const f = fixture(t); f.history.start(f.session.id, "r1", "codex");
  for (const event of [{ type: "item.started", item: { id: "1", type: "command_execution", command: "npm test" } },
    { type: "item.completed", item: { id: "1", type: "command_execution", command: "npm test", exit_code: 3, aggregated_output: "secret" } },
    { type: "item.started", item: { id: "2", type: "file_change" } }]) {
    for (const progress of progressEvents("codex", event)) f.history.update(f.session.id, "r1", progress);
  }
  f.history.finish(f.session.id, "r1", "completed");
  const [run] = f.history.list(f.session.id);
  assert.equal(run.rows[0].category, "test"); assert.equal(run.rows[0].state, "failed"); assert.equal(run.rows[0].exitCode, 3);
  assert.equal(run.rows[1].state, "unknown");
  assert.ok(!testCommand("echo test && rm file")); assert.ok(!testCommand("npm test; echo false"));
  assert.deepEqual(progressEvents("gemini", { text: "done" }), []);
});
test("parallel, late and cancelled runs remain isolated and history survives restart without invented completion", t => {
  const f = fixture(t); f.history.start(f.session.id, "a", "claude"); f.history.start(f.session.id, "b", "codex");
  f.history.update(f.session.id, "a", { category: "read", state: "running" });
  f.history.cancelMissing(f.session.id, ["codex"]);
  f.history.update(f.session.id, "a", { category: "edit", state: "completed" });
  assert.equal(f.history.list(f.session.id)[0].rows.length, 1);
  assert.equal(f.history.list(f.session.id)[0].state, "cancelled");
  f.history.close();
  const restored = new ProgressHistory(f.store, () => {}), runs = restored.list(f.session.id);
  assert.equal(runs[0].state, "cancelled"); assert.equal(runs[1].state, "unknown"); restored.close();
});
test("progress storms have bounded rows, history and IPC rate, with terminal status flushed immediately", async t => {
  const f = fixture(t); f.history.start(f.session.id, "r", "codex");
  for (let i = 0; i < 2000; i++) f.history.update(f.session.id, "r", { category: "command", state: "running", key: String(i).padStart(64, "0") });
  assert.equal(f.history.list(f.session.id)[0].rows.length, MAX_ROWS);
  assert.equal(f.emitted.length, 1);
  f.history.finish(f.session.id, "r", "failed");
  assert.equal(f.emitted.length, 2); assert.equal(f.emitted[1].progress.state, "failed");
  f.history.start(f.session.id, "anonymous", "claude");
  for (let i = 0; i < 100; i++) f.history.update(f.session.id, "anonymous", { category: "tool", state: "running" });
  const grouped = f.history.list(f.session.id).at(-1);
  assert.equal(grouped.rows.length, 1); assert.equal(grouped.rows[0].count, 100);
  f.history.finish(f.session.id, "anonymous", "completed");
  assert.equal(f.history.list(f.session.id).at(-1).rows[0].state, "unknown");
  for (let i = 0; i < 50; i++) { f.history.start(f.session.id, `r${i}`, "codex"); f.history.finish(f.session.id, `r${i}`, "completed"); }
  assert.equal(f.history.list(f.session.id).length, MAX_RUNS);
  assert.ok(fs.statSync(path.join(f.store.sessionDir(f.session.id), "progress.json")).size < 768 * 1024);
  await new Promise(resolve => setTimeout(resolve, 170));
  assert.equal(f.emitted.length, 104, "terminal flush cancels old queued updates");
});

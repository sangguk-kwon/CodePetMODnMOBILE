const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { ChatStore } = require("../src/chat/chat-store");
const { NativeSessionLink } = require("../src/chat/chat-native-sessions");
const { readMessageRange } = require("../src/chat/chat-history");
const capabilities = require("../src/providers/provider-capabilities");
const runner = require("../src/chat/chat-agent-runner");

function temporaryStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-native-session-"));
  t.after(() => {
    assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return new ChatStore({ root }).init();
}

test("native links survive restart, isolate participants/rooms/scopes, and reject stale writes", t => {
  const store = temporaryStore(t);
  const room = store.createSession({}).id;
  const other = store.createSession({}).id;
  const scope = { providerId: "codex", profileKey: "a", home: "home-a", cwd: "project-a", permissionMode: "chat", autoApprove: false, model: "default", effort: "default" };
  const id = randomUUID();
  const first = new NativeSessionLink(store, room, "codex", scope);
  first.observe(id); first.delivered("m1");
  store.close();
  const reopened = new NativeSessionLink(new ChatStore({ root: store.root }).init(), room, "codex", scope);
  assert.equal(reopened.cliSessionId, id);
  assert.equal(reopened.lastMessageId, "m1");
  first.delivered("stale");
  assert.equal(new NativeSessionLink(store, room, "codex", scope).lastMessageId, "m1");
  assert.equal(new NativeSessionLink(store, room, "codex-2", scope).cliSessionId, null);
  assert.equal(new NativeSessionLink(store, other, "codex", scope).cliSessionId, null);
  for (const key of Object.keys(scope)) {
    const existing = new NativeSessionLink(store, room, "codex", scope);
    existing.observe(id); existing.delivered("m1");
    const changed = new NativeSessionLink(store, room, "codex", { ...scope, [key]: "changed" });
    assert.equal(changed.cliSessionId, null, key);
    assert.equal(changed.lastMessageId, null, key);
  }
  assert.throws(() => reopened.observe(randomUUID()), /이어받지/);
  const before = fs.readFileSync(path.join(store.sessionDir(room), "native-sessions.json"), "utf8");
  store.readOnly = true;
  new NativeSessionLink(store, room, "codex", scope).observe(id);
  assert.equal(fs.readFileSync(path.join(store.sessionDir(room), "native-sessions.json"), "utf8"), before);
  assert.equal(store.readMeta(room).nativeSessions, undefined);
});

test("incremental context retains all unseen messages and honors a concurrent broadcast snapshot", t => {
  const store = temporaryStore(t), room = store.createSession({}).id;
  const append = (id, authorType = "user", author = "user") => store.appendEvent(room, { kind: "message", message: { id, text: `한글 ${id}`, authorType, author } });
  append("anchor");
  append("own", "agent", "codex");
  append("system", "system", "system");
  for (let i = 0; i < 160; i++) append(`unseen-${i}`);
  append("late", "agent", "claude");
  store.appendEvent(room, { kind: "cli-session", cliSessionId: randomUUID() });
  const messages = readMessageRange(store.transcriptPath(room), { afterId: "anchor", throughId: "unseen-159", agentId: "codex" });
  assert.equal(messages.length, 160);
  assert.equal(messages[0].id, "unseen-0");
  assert.equal(messages.at(-1).id, "unseen-159");
  assert.equal(readMessageRange(store.transcriptPath(room), { afterId: "missing", throughId: "late", agentId: "codex" }), null);
});

test("deleted chats cannot be recreated by late session callbacks; corrupt cursors fail visibly", t => {
  const store = temporaryStore(t), room = store.createSession({}).id;
  const link = new NativeSessionLink(store, room, "codex", {});
  link.observe(randomUUID());
  store.deleteSession(room);
  link.delivered("late");
  assert.equal(fs.existsSync(store.sessionDir(room)), false);
  const other = store.createSession({}).id;
  fs.writeFileSync(path.join(store.sessionDir(other), "native-sessions.json"), "[]");
  assert.throws(() => new NativeSessionLink(store, other, "codex", {}), /읽지 못했습니다/);
});

async function setup(t, providerId, behavior) {
  const store = temporaryStore(t), calls = [];
  const record = { id: providerId, name: providerId, status: "cli", aliases: [providerId], commandPath: "fixture",
    catalogStatus: "ready", modelOptions: ["fixture", "fixture-next"].map(id => ({ id, efforts: ["low", "high"] })), permissions: { chat: { supported: true } } };
  t.mock.method(capabilities, "createCapabilityService", () => ({ defs: [record], getRecord: () => record, discover: async () => [record] }));
  t.mock.method(runner, "runAgentProcess", input => {
    calls.push(input);
    const flag = providerId === "codex" ? "resume" : providerId === "agy" ? "--conversation" : "--resume";
    const position = input.argv.indexOf(flag);
    const resumedId = position >= 0 ? input.argv[position + 1] : null;
    const id = resumedId || randomUUID();
    const init = providerId === "codex" ? { type: "thread.started", thread_id: id }
      : providerId === "agy" ? { event: "init", conversation_id: id }
        : { type: "system", subtype: "init", session_id: id };
    input.parseLine(JSON.stringify(init));
    const result = behavior?.({ input, resumedId, calls }) || { ok: true, text: "fixture-own-answer" };
    return { promise: Promise.resolve(result), cancel() {} };
  });
  const modulePath = require.resolve("../src/chat/chat-ipc");
  delete require.cache[modulePath];
  t.after(() => { delete require.cache[modulePath]; });
  const { createChatFeature } = require(modulePath);
  const handlers = new Map();
  const options = { store, storeRoot: store.root, platform: "linux", env: { CODEX_HOME: path.join(store.root, "source-codex") }, electron: { ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} }, dialog: {}, BrowserWindow: class {}, shell: {} } };
  let feature;
  const restart = () => { feature?.shutdown(); feature = createChatFeature(options); feature.registerIpcHandlers(); };
  restart();
  t.after(() => feature.shutdown());
  const invoke = (name, input) => handlers.get(name)({}, input);
  const initial = await invoke("chat:state");
  const sessionId = initial.activeSessionId;
  let lastAnswerId = null;
  const send = async text => {
    assert.equal((await invoke("chat:send", { sessionId, text: `@${providerId} ${text}` })).ok, true);
    for (let i = 0; i < 100; i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      const state = await invoke("chat:state");
      const answers = state.session.messages.filter(message => message.authorType === "agent");
      if (answers.length && answers.at(-1).id !== lastAnswerId && !state.session.turnState.current) { lastAnswerId = answers.at(-1).id; return answers.at(-1); }
    }
    assert.fail("Response did not finish");
  };
  return { store, calls, invoke, send, restart, sessionId, env: options.env };
}

test("partial failure resumes without replaying the previously consumed user input", async t => {
  const {calls,send} = await setup(t,"codex", ({input,calls}) => {
    if(calls.length === 1) {
      input.onEvent({kind:"delta",text:"partial"});
      return {ok:false,text:"partial",status:"partial",error:"exit 7",exitCode:7};
    }
  });
  assert.equal((await send("already-consumed-secret")).error,true);
  assert.ok(!(await send("continue-after-failure")).error);
  assert.doesNotMatch(calls[1].prompt,/already-consumed-secret/);
});

for (const providerId of ["codex", "claude", "agy", "grok"]) test(`${providerId}: same native session across turns/restart, with incremental prompts`, async t => {
  const { store, calls, invoke, send, restart, sessionId } = await setup(t, providerId);
  assert.ok(!(await send("first-only-secret")).error);
  assert.ok(!(await send("second-only-question")).error);
  assert.match(calls[0].prompt, /first-only-secret/);
  assert.doesNotMatch(calls[1].prompt, /first-only-secret|fixture-own-answer/);
  assert.match(calls[1].prompt, /second-only-question/);
  const links = () => JSON.parse(fs.readFileSync(path.join(store.sessionDir(sessionId), "native-sessions.json"), "utf8"));
  const id = links()[providerId].cliSessionId;
  if (providerId === "codex") {
    assert.ok(calls[0].env.CODEX_HOME.startsWith(path.join(store.root, "runtime", "codex")));
    assert.ok(calls[0].argv.includes(`sqlite_home=${JSON.stringify(calls[0].env.CODEX_HOME)}`));
    assert.ok(!calls[0].argv.includes("--ephemeral"));
  }
  for (let i = 0; i < 65; i++) store.appendEvent(sessionId, { kind: "message", message: { id: `external-${i}`, text: `missed-${i}`, authorType: "user", author: "user" } });
  assert.ok(!(await send("third-only-question")).error);
  assert.match(calls[2].prompt, /missed-0\n/);
  assert.match(calls[2].prompt, /missed-64\n/);
  restart();
  await invoke("chat:state");
  // Only the latest page is mounted after restart; the cursor is independent.
  assert.ok(!(await send("fourth-only-question")).error);
  assert.equal(links()[providerId].cliSessionId, id);
  assert.ok(calls.slice(1).every(call => call.argv.includes(id)));
  if (providerId === "codex") assert.ok(calls.every(call => call.env.CODEX_HOME === calls[0].env.CODEX_HOME));
  assert.doesNotMatch(calls[3].prompt, /first-only-secret|second-only-question|third-only-question|missed-0/);
});

test("trace lookup follow-ups reuse the current native session without repeating the original task", async t => {
  const { calls, send } = await setup(t, "codex", ({ calls }) => ({ ok: true, text: calls.length === 1 ? '[[CODEPET_TRACE:{"agent":"claude"}]]' : "done" }));
  assert.ok(!(await send("original-task-marker")).error);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].argv.includes("resume"));
  assert.match(calls[1].prompt, /작업 기록 조회/);
  assert.doesNotMatch(calls[1].prompt, /original-task-marker/);
});

test("a missing native session fails visibly without silently starting a replacement", async t => {
  const { calls, send } = await setup(t, "claude", ({ resumedId }) => resumedId ? { ok: false, error: "No conversation found for session" } : null);
  assert.ok(!(await send("first")).error);
  const answer = await send("second");
  assert.equal(answer.error, true);
  assert.match(answer.text, /No conversation found/);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].argv.includes("--resume"));
});

for (const providerId of ["claude", "codex"]) test(`${providerId}: model/effort changes retain the native cursor across restart`, async t => {
  const { store, calls, invoke, send, restart, sessionId } = await setup(t, providerId, ({ input }) => {
    if (providerId === "claude") {
      input.parseLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-init" }));
      input.parseLine(JSON.stringify({ type: "assistant", message: { model: "claude-confirmed", content: [] } }));
      input.parseLine(JSON.stringify({ type: "result", modelUsage: { "old-cumulative-model": {} } }));
    }
  });
  const configure = async patch => {
    const result = await invoke("chat:agent:configure", { sessionId, agentId: providerId, patch });
    assert.ok(!result.error, JSON.stringify(result));
  };
  const linkFile = path.join(store.sessionDir(sessionId), "native-sessions.json");
  await configure({ model: "fixture", effort: "low" });
  const first = await send("remember-marker");
  const id = JSON.parse(fs.readFileSync(linkFile))[providerId].cliSessionId;
  assert.equal(first.agentMeta.model, "fixture");
  assert.equal(first.agentMeta.effort, "low");
  assert.equal(first.agentMeta.appliedModel, providerId === "claude" ? "claude-confirmed" : undefined);
  assert.equal(first.agentMeta.appliedEffort, undefined);
  await configure({ model: "fixture-next", effort: "high" });
  restart();
  const second = await send("continue-marker");
  assert.equal(JSON.parse(fs.readFileSync(linkFile))[providerId].cliSessionId, id);
  assert.ok(calls[1].argv.includes(id));
  assert.ok(calls[1].argv.includes("fixture-next"));
  assert.ok(calls[1].argv.includes(providerId === "claude" ? "high" : "model_reasoning_effort=high"));
  assert.doesNotMatch(calls[1].prompt, /remember-marker/);
  assert.equal(second.agentMeta.model, "fixture-next");
  assert.equal(second.agentMeta.effort, "high");
});

for (const providerId of ["claude", "codex"]) test(`${providerId}: legacy default hash migrates, unknown hash falls back to budgeted history`, async t => {
  const { store, calls, invoke, send, sessionId, env } = await setup(t, providerId);
  await send("first-marker");
  const file = path.join(store.sessionDir(sessionId), "native-sessions.json");
  const index = JSON.parse(fs.readFileSync(file));
  const original = index[providerId].cliSessionId;
  const home = providerId === "codex" ? calls[0].env.CODEX_HOME : env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const scope = { providerId, profileKey: null, activeKey: null, home, cwd: calls[0].cwd, permissionMode: "chat", autoApprove: false,
    model: "default", effort: "default" };
  const { createHash } = require("node:crypto");
  const oldScopeHash = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
  index[providerId].scope = oldScopeHash;
  fs.writeFileSync(file, JSON.stringify(index));
  await invoke("chat:agent:configure", { sessionId, agentId: providerId, patch: { model: "fixture", effort: "high" } });
  await send("second-marker");
  // The fixture's account identity is deterministic; a matching default candidate resumes.
  assert.ok(calls[1].argv.includes(original));
  const unknown = JSON.parse(fs.readFileSync(file));
  unknown[providerId].scope = "unrecoverable-legacy-hash";
  fs.writeFileSync(file, JSON.stringify(unknown));
  for (let i = 0; i < 110; i++) store.appendEvent(sessionId, { kind: "message", message: {
    id: `fallback-${i}`, text: `history-${i}`, authorType: "user", author: "user",
  } });
  await send("third-marker");
  assert.ok(!calls[2].argv.includes(original));
  assert.match(calls[2].prompt, /first-marker/);
  assert.match(calls[2].prompt, /fixture-own-answer/);
  assert.match(calls[2].prompt, /history-0\n/);
  assert.match(calls[2].prompt, /history-109\n/);
});

test("scope recovery warns the CLI when older conversation exceeds the byte budget", async t => {
  const { store, calls, send, sessionId } = await setup(t, "claude");
  await send("old-marker");
  const file = path.join(store.sessionDir(sessionId), "native-sessions.json");
  const index = JSON.parse(fs.readFileSync(file));
  index.claude.scope = "unknown-legacy-hash";
  fs.writeFileSync(file, JSON.stringify(index));
  for (let i = 0; i < 10; i++) store.appendEvent(sessionId, { kind: "message", message: {
    id: `large-${i}`, authorType: "user", author: "user", text: `large-marker-${i} ` + "한글".repeat(10000),
  } });
  await send("current-marker");
  assert.match(calls[1].prompt, /current-marker/);
  assert.match(calls[1].prompt, /large-marker-9/);
  assert.doesNotMatch(calls[1].prompt, /old-marker|large-marker-0/);
  assert.match(calls[1].prompt, /256KiB.*생략/);
  // The budget is for messages; role instructions and the omission notice are additional.
  assert.ok(Buffer.byteLength(calls[1].prompt) < 280 * 1024);
});

test("rule state persists only after delivery and cannot be overwritten by stale or cancelled cursors", t => {
  const store = temporaryStore(t), room = store.createSession({}).id, id = randomUUID();
  const hash = "a".repeat(64);
  const link = new NativeSessionLink(store, room, "claude", { home: "fixture" });
  const plan = link.planPromptRules(hash);
  assert.equal(plan.full, true);
  link.observe(id);
  const beforeDelivery = JSON.parse(fs.readFileSync(link.file)).claude;
  assert.equal(beforeDelivery.promptRulesHash, null);
  assert.equal(beforeDelivery.promptTurnCount, 0);
  link.delivered("m1", plan);
  link.delivered("m1", plan);
  const reopened = new NativeSessionLink(store, room, "claude", { home: "fixture" });
  assert.equal(reopened.promptRulesHash, hash);
  assert.equal(reopened.promptTurnCount, 1);
  assert.equal(reopened.planPromptRules(hash).full, false);
  assert.equal(reopened.planPromptRules("b".repeat(64)).full, true);
  const next = reopened.planPromptRules(hash);
  reopened.delivered("m2", next);
  link.delivered("late", link.planPromptRules("b".repeat(64)));
  assert.equal(JSON.parse(fs.readFileSync(link.file)).claude.promptTurnCount, 2);
  assert.equal(JSON.parse(fs.readFileSync(link.file)).claude.promptRulesHash, hash);
  const reset = new NativeSessionLink(store, room, "claude", { home: "another-account" });
  assert.equal(reset.promptTurnCount, 0);
  assert.equal(reset.planPromptRules(hash).full, true);
});

for (const providerId of ["claude", "codex"]) test(`${providerId}: repeat rules only initially, every twentieth turn, and after rule changes or scope reset`, async t => {
  const { store, calls, send, invoke, restart, sessionId } = await setup(t, providerId);
  for (let i = 1; i <= 41; i++) {
    if (i === 10) restart();
    await send(`turn-${i}`);
    const full = /이모티콘 의미 사전/.test(calls.at(-1).prompt);
    assert.equal(full, i === 1 || i === 20 || i === 40, `turn ${i}`);
    assert.match(calls.at(-1).prompt, /CODEPET_TRACE/);
    assert.match(calls.at(-1).prompt, /비신뢰 도구 출력/);
    if (!full) assert.match(calls.at(-1).prompt, /세션 시작 때 받은 규칙/);
  }
  const file = path.join(store.sessionDir(sessionId), "native-sessions.json");
  assert.equal(JSON.parse(fs.readFileSync(file))[providerId].promptTurnCount, 41);
  await invoke("chat:agent:configure", { sessionId, agentId: providerId, patch: { name: "renamed" } });
  await send("after-rename");
  assert.match(calls.at(-1).prompt, /이모티콘 의미 사전/);
  await send("same-new-rules");
  assert.doesNotMatch(calls.at(-1).prompt, /이모티콘 의미 사전/);
  const index = JSON.parse(fs.readFileSync(file));
  index[providerId].scope = "unknown";
  fs.writeFileSync(file, JSON.stringify(index));
  await send("scope-reset");
  assert.match(calls.at(-1).prompt, /이모티콘 의미 사전/);
  assert.equal(JSON.parse(fs.readFileSync(file))[providerId].promptTurnCount, 1);
});

test("trace lookup continuations are compact and do not advance the persisted turn count", async t => {
  const { store, calls, send, sessionId } = await setup(t, "claude", ({ calls }) => ({ ok: true,
    text: calls.length === 1 ? '[[CODEPET_TRACE:{"agent":"codex"}]]' : "done" }));
  await send("lookup");
  assert.equal(calls.length, 2);
  assert.match(calls[0].prompt, /이모티콘 의미 사전/);
  assert.doesNotMatch(calls[1].prompt, /이모티콘 의미 사전/);
  assert.match(calls[1].prompt, /CODEPET_TRACE/);
  assert.match(calls[1].prompt, /비신뢰 도구 출력/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(store.sessionDir(sessionId), "native-sessions.json"))).claude.promptTurnCount, 1);
});

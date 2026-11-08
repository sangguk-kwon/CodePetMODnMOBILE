const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const capabilities = require("../src/providers/provider-capabilities");

test("permission IPC selects the session's account, rejects unknown targets and never prepares credentials", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codepet-permission-ipc-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = { id: "claude", name: "Claude", aliases: ["claude"], status: "cli", catalogStatus: "ready",
    modelOptions: [{ id: "fixture-model" }], permissions: { chat: { supported: true } } };
  t.mock.method(capabilities, "createCapabilityService", () => ({ defs: [base], getRecord: id => id === base.id ? base : null,
    discover: async () => [base] }));
  const privateHome = path.join(root, "private"), globalHome = path.join(root, "global");
  await fs.mkdir(privateHome);
  await fs.writeFile(path.join(privateHome, "settings.json"), JSON.stringify({ permissions: { deny: ["Bash(secret)"] } }));
  const service = { list: () => [{ key: "a", label: "fixture" }], discover: async () => base, record: () => base,
    settingsContext: key => { assert.equal(key, "a"); return { sourceHome: privateHome, inheritedFrom: globalHome }; },
    prepare: () => { throw new Error("diagnostic must never prepare credentials"); } };
  const modulePath = require.resolve("../src/chat/chat-ipc");
  delete require.cache[modulePath];
  t.after(() => { delete require.cache[modulePath]; });
  const handlers = new Map();
  const feature = require(modulePath).createChatFeature({ storeRoot: path.join(root, "store"), claudeAccounts: service,
    env: { CLAUDE_CONFIG_DIR: globalHome }, electron: {
      ipcMain: { handle: (name, handler) => handlers.set(name, handler), on() {} }, dialog: {}, BrowserWindow: class {}, shell: {},
    } });
  t.after(() => feature.shutdown());
  feature.registerIpcHandlers();
  const invoke = (name, data) => handlers.get(name)({}, data);
  const { activeSessionId: sessionId } = await invoke("chat:state");
  await invoke("chat:agent:add", { sessionId, providerId: "claude", profileKey: "a" });
  const result = await invoke("chat:agent:permissions", { sessionId, agentId: "claude-2", sourceHome: "/ignored-input" });
  assert.equal(result.ok, true);
  assert.equal(result.diagnostics.launch.ready, true);
  assert.equal(result.diagnostics.sourceHome, privateHome);
  assert.equal(result.diagnostics.settings.find(file => file.path.endsWith("settings.json") && file.scope.startsWith("선택")).rules.deny.count, 1);
  assert.doesNotMatch(JSON.stringify(result), /secret|ignored-input/);
  assert.equal((await invoke("chat:agent:permissions", { sessionId, agentId: "missing" })).ok, false);
  assert.equal((await invoke("chat:agent:permissions", { sessionId: "missing", agentId: "claude" })).ok, false);
  const fallback = await invoke("chat:agent:permissions", { sessionId, agentId: "claude" });
  assert.equal(fallback.diagnostics.sourceHome, globalHome);
  assert.equal(fallback.diagnostics.authentication, "unknown");
});

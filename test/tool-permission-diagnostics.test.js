const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { diagnoseToolPermissions, inspectSettings, MAX_SETTINGS_BYTES } = require("../src/chat/tool-permission-diagnostics");
const { SavedChatAccounts } = require("../src/chat/saved-chat-accounts");
const { CodexChatAccounts } = require("../src/chat/codex-chat-accounts");

function provider(id) {
  return { id, status: "cli", version: "fixture-version", catalogStatus: "ready", modelOptions: [{ id: "fixture-model" }], permissions: Object.fromEntries(
    ["chat", "workspace-read", "workspace-write"].map(mode => [mode, { supported: true }])) };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codepet-permissions-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("permission snapshots derive bypass and sandbox boundaries from the real launch builder", async t => {
  const root = await fixture(t);
  for (const id of ["claude", "codex"]) {
    for (const mode of ["chat", "workspace-read", "workspace-write"]) {
      for (const requested of [false, true]) {
        const data = await diagnoseToolPermissions({ record: provider(id), permissionMode: mode,
          workspace: root, chatCwd: root, config: { autoApprove: requested }, platform: "win32" });
        const bypass = mode === "workspace-write" && requested;
        assert.equal(data.launch.ready, true);
        assert.equal(data.autoApprove, bypass);
        assert.equal(data.launch.approval, bypass ? "bypass" : mode === "workspace-write" ? id === "claude" ? "default" : "on-request" : "cli-default");
        assert.equal(data.launch.sandbox, id === "claude" ? "not-set-by-codepet" : bypass ? "disabled" : mode === "workspace-write" ? "workspace-write" : "read-only");
        assert.equal(data.launch.mcp, id === "claude" ? "excluded-by-codepet" : "not-verified");
        assert.equal(data.checks.network, "not-probed");
        assert.equal(data.checks.githubAuthentication, "not-probed");
      }
    }
  }
});

test("settings inventory exposes counts and known tool names without secrets or command arguments", async t => {
  const root = await fixture(t), file = path.join(root, "settings.json");
  const raw = JSON.stringify({ env: { ANTHROPIC_API_KEY: "secret-api-key" }, hooks: { command: "secret-hook" },
    permissions: { allow: ["Bash(curl -H secret-header)", "Read", "mcp__private_secret_server__tool", "secret-tool"],
      deny: ["Read(/secret/account)"] } });
  await fs.writeFile(file, raw);
  const result = await inspectSettings(file, "fixture");
  assert.equal(result.status, "present");
  assert.deepEqual(result.rules.allow, { count: 4, tools: ["Bash", "MCP", "Read"] });
  assert.deepEqual(result.rules.deny, { count: 1, tools: ["Read"] });
  assert.doesNotMatch(JSON.stringify(result), /secret|curl|hooks|ANTHROPIC/);
  assert.equal(await fs.readFile(file, "utf8"), raw);
});

test("invalid, oversized, absent and non-file settings never return raw content", async t => {
  const root = await fixture(t), file = path.join(root, "settings.json");
  assert.equal((await inspectSettings(file, "fixture")).status, "missing");
  await fs.writeFile(file, '{"permissions": "secret-invalid');
  assert.equal((await inspectSettings(file, "fixture")).status, "invalid");
  await fs.writeFile(file, JSON.stringify({ permissions: { allow: "secret-not-an-array" } }));
  assert.equal((await inspectSettings(file, "fixture")).status, "invalid");
  await fs.writeFile(file, "x".repeat(MAX_SETTINGS_BYTES + 1));
  assert.equal((await inspectSettings(file, "fixture")).status, "too-large");
  assert.notEqual((await inspectSettings(root, "fixture")).status, "present");
});

test("TOML is explicitly inventory-only; missing configs never imply effective defaults", async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, "config.toml"), 'approval_policy = "never"\napi_key = "secret-value"');
  const result = await diagnoseToolPermissions({ record: provider("codex"), sourceHome: root, chatCwd: root });
  assert.equal(result.settings[0].inventoryOnly, true);
  assert.equal(result.launch.approval, "cli-default");
  assert.doesNotMatch(JSON.stringify(result), /secret-value|api_key/);
});

test("unlaunchable selections are reported without inventing effective flags", async t => {
  const root = await fixture(t);
  const result = await diagnoseToolPermissions({ record: { ...provider("claude"), status: "absent" },
    sourceHome: root, chatCwd: root, config: { autoApprove: true }, permissionMode: "workspace-write" });
  assert.equal(result.launch.ready, false);
  assert.equal(result.launch.approval, "unavailable");
  assert.equal(result.launch.mcp, "unknown");
});

test("saved-account settings contexts do not prepare accounts, write files or refresh credentials", async t => {
  const root = await fixture(t);
  const claude = new SavedChatAccounts({ providerId: "claude", switcher: { home: root,
    store: { root: path.join(root, "profiles"), get: key => key === "a" ? { key, secret: "do-not-read" } : null } } });
  assert.deepEqual(claude.settingsContext("a"), { sourceHome: path.join(root, "profiles", "chat", "a"), inheritedFrom: path.join(root, ".claude") });
  const codex = new CodexChatAccounts({ switcher: { codexHome: path.join(root, "global"),
    getProfile: key => key === "a" ? { hasAuth: true, homePath: path.join(root, "private") } : null } });
  assert.deepEqual(codex.settingsContext("a"), { sourceHome: path.join(root, "private"), inheritedFrom: path.join(root, "global") });
  assert.throws(() => claude.settingsContext("missing"));
  assert.throws(() => codex.settingsContext("missing"));
  assert.deepEqual(await fs.readdir(root), []);
});

test("restricted automatic approvals are diagnosed independently of sandbox bypass", async t => {
  const root = await fixture(t);
  const result = await diagnoseToolPermissions({ record: provider("codex"), sourceHome: root, chatCwd: root, workspace: root,
    permissionMode: "workspace-write", config: { autoApprove: true, codexSandbox: "workspace-write" } });
  assert.equal(result.launch.approval, "never");
  assert.equal(result.launch.sandbox, "workspace-write");
  assert.equal(result.launch.transport, "app-server");
  assert.ok(!result.notes.some(note => note.includes("이전 자동 승인")));
});

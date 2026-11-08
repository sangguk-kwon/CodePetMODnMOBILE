const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ToolSettingsStore, settingsCapabilities, validateSettings, applyToolSettings, evaluateApproval, defaults } = require("../src/chat/tool-settings");
const rule = (kind, match, effect = "allow", id = `${kind}-${effect}`) => ({ id, kind, match, effect });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codepet-tool-settings-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); fs.mkdirSync(workspace);
  const store = { root, readOnly: false }, service = new ToolSettingsStore(store);
  const context = { providerId: "codex", accountKey: "a", sourceHome: path.join(root, "account-a"), workspace };
  const capabilities = settingsCapabilities({ ...context, permissionMode: "workspace-write", autoApprove: false });
  return { root, workspace, store, service, context, capabilities, key: service.key(context) };
}

test("settings persist with workspace/account/provider isolation, revision conflicts and no CLI writes", t => {
  const f = fixture(t), initial = f.service.get(f.key);
  const settings = { ...defaults(), rules: [rule("command", "npm test")] };
  const saved = f.service.save(f.key, settings, initial.revision, f.capabilities);
  assert.deepEqual(new ToolSettingsStore(f.store).get(f.key), saved);
  assert.throws(() => f.service.save(f.key, defaults(), initial.revision, f.capabilities), /변경/);
  for (const patch of [{ accountKey: "b" }, { providerId: "claude" }, { sourceHome: path.join(f.root, "other") }, { workspace: f.root }]) {
    assert.deepEqual(f.service.get(f.service.key({ ...f.context, ...patch })).settings, defaults());
  }
  assert.deepEqual(fs.readdirSync(f.root).sort(), ["tool-settings.json", "workspace"]);
  f.store.readOnly = true;
  assert.throws(() => f.service.save(f.key, defaults(), saved.revision, f.capabilities), /읽기 전용/);
});

test("schema errors, unknown tools, secrets, duplicate rules and corrupt stored versions fail closed", t => {
  const f = fixture(t);
  for (const input of [{ ...defaults(), version: 2 }, { ...defaults(), tools: { Unknown: false } },
    { ...defaults(), tools: { Read: "false" } }, { ...defaults(), env: { secret: "value" } },
    { ...defaults(), rules: [rule("command", "echo a\necho b")] },
    { ...defaults(), rules: [rule("command", "curl -H 'Authorization: Bearer secret-token' https://example.invalid")] },
    { ...defaults(), rules: [rule("command", "echo a"), rule("command", "echo b")] },
    { ...defaults(), rules: [rule("file", "relative.txt")] }, { ...defaults(), rules: [rule("file", path.join(f.workspace, "*.txt"))] }]) {
    assert.throws(() => validateSettings(input));
  }
  fs.writeFileSync(f.service.file, JSON.stringify({ version: 2, entries: {} }));
  assert.throws(() => f.service.get(f.key), /기본 허용/);
  fs.writeFileSync(f.service.file, "broken"); assert.throws(() => f.service.get(f.key), /기본 허용/);
});

test("unsupported settings cannot be enabled by IPC and legacy values are preserved", t => {
  const f = fixture(t), initial = f.service.get(f.key);
  assert.throws(() => f.service.save(f.key, { ...defaults(), tools: { Bash: false } }, initial.revision, f.capabilities), /바꿀 수/);
  const disabled = settingsCapabilities({ ...f.context, permissionMode: "workspace-write", autoApprove: true });
  assert.throws(() => f.service.save(f.key, { ...defaults(), rules: [rule("command", "npm test")] }, initial.revision, disabled), /지원하지/);
  const saved = f.service.save(f.key, { ...defaults(), rules: [rule("command", "npm test")] }, initial.revision, f.capabilities);
  assert.equal(f.service.save(f.key, saved.settings, saved.revision, disabled).settings.rules.length, 1);
  const current = f.service.get(f.key);
  assert.equal(f.service.save(f.key, defaults(), current.revision, disabled).settings.rules.length, 0);
});

test("Claude exclusions preserve native defaults, strict MCP and the selected permission boundary", () => {
  const settings = validateSettings({ ...defaults(), tools: { Bash: false, WebFetch: false, Read: true } });
  const invocation = { ok: true, argv: ["--tools", "Read,Grep,Glob", "--strict-mcp-config"] };
  const modified = applyToolSettings(invocation, "claude", settings);
  assert.deepEqual(modified.argv, [...invocation.argv, "--disallowedTools", "Bash,WebFetch"]);
  assert.deepEqual(invocation.argv, ["--tools", "Read,Grep,Glob", "--strict-mcp-config"]);
  assert.equal(applyToolSettings(invocation, "codex", settings), invocation);
  assert.equal(settingsCapabilities({ providerId: "claude", permissionMode: "workspace-read" }).rules.command, false);
});

test("command rules match complete unredacted command and cwd; deny wins; added grants never auto allow", t => {
  const { workspace } = fixture(t);
  const settings = { ...defaults(), rules: [rule("command", "npm test")] };
  const target = { kind: "command", command: "npm test", cwd: workspace };
  assert.equal(evaluateApproval(settings, target, workspace).effect, "allow");
  for (const patch of [{ command: "npm test && echo injected" }, { command: "npm test " }, { cwd: path.dirname(workspace) },
    { network: true }, { additionalPermissions: { network: true } }, { grantRoot: workspace }]) {
    assert.equal(evaluateApproval(settings, { ...target, ...patch }, workspace), null);
  }
  settings.rules.push(rule("command", "npm test", "deny"));
  assert.equal(evaluateApproval(settings, target, workspace).effect, "deny");
});

test("file rules require every exact path, reject roots and links, and prioritize any denied file", t => {
  const { root, workspace } = fixture(t), a = path.join(workspace, "a.txt"), b = path.join(workspace, "b.txt");
  fs.writeFileSync(a, "fixture");
  const settings = { ...defaults(), rules: [rule("file", a)] }, target = { kind: "file", paths: [a], cwd: workspace };
  assert.equal(evaluateApproval(settings, target, workspace).effect, "allow");
  for (const patch of [{ paths: [a, b] }, { grantRoot: workspace }, { paths: [root] }, { paths: ["a.txt"] }, { paths: [] }]) {
    assert.equal(evaluateApproval(settings, { ...target, ...patch }, workspace), null);
  }
  settings.rules.push(rule("file", b, "deny"));
  assert.equal(evaluateApproval(settings, { ...target, paths: [a, b] }, workspace).effect, "deny");
  const linked = path.join(workspace, "linked.txt"); fs.linkSync(a, linked);
  assert.equal(evaluateApproval(settings, target, workspace), null);
  fs.unlinkSync(linked);
  const linkedDir = path.join(workspace, "linked-dir"); fs.symlinkSync(root, linkedDir, "junction");
  const linkPath = path.join(linkedDir, "outside.txt"); settings.rules.push(rule("file", linkPath, "allow", "link"));
  assert.equal(evaluateApproval(settings, { ...target, paths: [linkPath] }, workspace), null);
});

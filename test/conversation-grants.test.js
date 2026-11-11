const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { ChatStore } = require("../src/chat/chat-store");
const { ConversationGrants } = require("../src/chat/conversation-grants");
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "codepet-conversation-")));
  const store = new ChatStore({ root: path.join(root, "store") }).init();
  t.after(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const session = store.createSession({}), other = store.createSession({});
  return { root, store, session, other, grants: new ConversationGrants(store) };
}
test("captured conversation grants persist, stay scoped and can be revoked without editing global config", t => {
  const f = fixture(t), target = { kind: "command", command: "npm test", cwd: f.root };
  const key = f.grants.key("claude", "account-workspace-permissions");
  f.grants.add(f.session.id, key, f.grants.candidate(target, f.root));
  const restored = new ConversationGrants(f.store);
  assert.ok(restored.match(f.session.id, key, target, f.root));
  assert.ok(!restored.match(f.other.id, key, target, f.root));
  assert.ok(!restored.match(f.session.id, restored.key("codex", "account-workspace-permissions"), target, f.root));
  assert.ok(!restored.match(f.session.id, restored.key("claude", "different-account"), target, f.root));
  assert.ok(!restored.match(f.session.id, key, { ...target, command: "npm test changed" }, f.root));
  restored.remove(f.session.id, key, restored.list(f.session.id, key)[0].id);
  assert.ok(!restored.match(f.session.id, key, target, f.root));
});
test("session grants cannot broaden file roots, include secrets, follow links or bypass extra permissions", t => {
  const f = fixture(t), command = { kind: "command", command: "echo safe", cwd: f.root };
  for (const change of [{ additionalPermissions: {} }, { network: true }, { grantRoot: f.root }, { command: "curl -H 'Authorization: Bearer secret' https://example.invalid" }]) {
    assert.equal(f.grants.candidate({ ...command, ...change }, f.root), null);
  }
  const file = { kind: "file", paths: [path.join(f.root, "target.txt")], cwd: f.root };
  assert.equal(f.grants.candidate(file, f.root).kind, "file");
  assert.equal(f.grants.candidate({ ...file, paths: [path.join(f.root, "..", "outside.txt")] }, f.root), null);
  assert.equal(f.grants.candidate({ ...file, paths: [...file.paths, path.join(f.root, "other.txt")] }, f.root), null);
  const key = f.grants.key("codex", "scope"); f.grants.add(f.session.id, key, f.grants.candidate(file, f.root));
  f.store.readOnly = true;
  assert.throws(() => f.grants.remove(f.session.id, key, "id"), /읽기 전용/);
  f.store.readOnly = false;
  fs.writeFileSync(f.grants.file(f.session.id), '{"version":900}');
  assert.throws(() => f.grants.match(f.session.id, key, file, f.root), /읽지 못/);
});

const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { writeJsonAtomic } = require("./chat-store");
const { validateSettings, evaluateApproval } = require("./tool-settings");
const { redactSensitiveText } = require("./chat-run-diagnostics");

// CodePet-owned grants stay revocable across CLI process restarts. We never
// send native session-wide permission amendments that the UI cannot withdraw.
class ConversationGrants {
  constructor(store) { this.store = store; }
  file(sessionId) { return path.join(this.store.sessionDir(sessionId), "conversation-grants.json"); }
  key(agentId, scope) { return createHash("sha256").update(JSON.stringify([agentId, scope])).digest("hex"); }
  read(sessionId) {
    try {
      const file = this.file(sessionId);
      if (fs.statSync(file).size > 512 * 1024) throw Error("size");
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data.version !== 1 || !data.entries || Array.isArray(data.entries) || Object.keys(data.entries).length > 128) throw Error("schema");
      for (const [key, rules] of Object.entries(data.entries)) {
        if (!/^[a-f0-9]{64}$/.test(key)) throw Error("key");
        validateSettings({ version: 1, tools: {}, rules });
        if (rules.some(rule => rule.effect !== "allow")) throw Error("effect");
      }
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, entries: {} };
      throw Error("이 대화의 허용 목록을 읽지 못했습니다. 설정을 확인한 뒤 다시 시도하세요.");
    }
  }
  list(sessionId, key) { return this.read(sessionId).entries[key] || []; }
  write(sessionId, data) {
    if (this.store.readOnly || this.store.readMeta(sessionId)?.readOnly) throw Error("읽기 전용 저장소입니다.");
    if (Buffer.byteLength(JSON.stringify(data, null, 2)) > 512 * 1024) throw Error("이 대화의 허용 목록 용량을 초과했습니다.");
    writeJsonAtomic(this.file(sessionId), data);
  }
  candidate(target, workspace) {
    if (!target || target.network || target.additionalPermissions || target.grantRoot) return null;
    let rule;
    if (target.kind === "command" && typeof target.command === "string") rule = { id: "candidate", kind: "command", effect: "allow", match: target.command };
    else if (target.kind === "file" && target.paths?.length === 1) rule = { id: "candidate", kind: "file", effect: "allow", match: target.paths[0] };
    else return null;
    if (redactSensitiveText(rule.match).includes("[REDACTED]")) return null;
    try {
      const settings = validateSettings({ version: 1, tools: {}, rules: [rule] });
      return evaluateApproval(settings, target, workspace) ? rule : null;
    } catch { return null; }
  }
  match(sessionId, key, target, workspace) {
    return evaluateApproval({ rules: this.list(sessionId, key) }, target, workspace)?.effect === "allow";
  }
  add(sessionId, key, candidate) {
    const data = this.read(sessionId), rules = data.entries[key] || [];
    if (rules.some(rule => rule.kind === candidate.kind && rule.match === candidate.match)) return;
    if (rules.length >= 100 || !data.entries[key] && Object.keys(data.entries).length >= 128) throw Error("이 대화에 저장할 수 있는 허용 범위를 초과했습니다.");
    data.entries[key] = [...rules, { ...candidate, id: randomUUID() }];
    this.write(sessionId, data);
  }
  remove(sessionId, key, id) {
    const data = this.read(sessionId);
    if (!Object.hasOwn(data.entries, key)) return;
    data.entries[key] = (data.entries[key] || []).filter(rule => rule.id !== id);
    this.write(sessionId, data);
  }
}

module.exports = { ConversationGrants };

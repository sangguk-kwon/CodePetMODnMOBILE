const fs = require("node:fs");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { writeJsonAtomic } = require("./chat-store");
const { redactSensitiveText } = require("./chat-run-diagnostics");

const TOOLS = Object.freeze({ Read: "파일 읽기", Grep: "내용 검색", Glob: "파일 찾기", Edit: "파일 편집",
  Write: "파일 쓰기", Bash: "명령 실행", WebSearch: "웹 검색", WebFetch: "웹 읽기" });
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const plain = value => value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const canonical = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
const defaults = () => ({ version: 1, tools: {}, rules: [] });

function settingsCapabilities({ providerId, permissionMode, autoApprove, workspace }) {
  const write = permissionMode === "workspace-write";
  const rules = providerId === "codex" && write && !autoApprove && Boolean(workspace);
  return {
    tools: Object.entries(TOOLS).map(([id, label]) => ({ id, label,
      supported: providerId === "claude" && (write || permissionMode === "workspace-read" && ["Read", "Grep", "Glob"].includes(id)) })),
    rules: { command: rules, file: rules },
    notes: [
      "CodePet 전용 설정입니다. 선택한 계정·공급자·작업공간에 저장하며 다른 대화에서도 같은 범위에 적용합니다. 전역 CLI 설정은 수정하지 않습니다.",
      "저장 후 다음 실행부터 적용합니다. 적용 범위를 사용하는 작업이 실행 중이면 저장할 수 없습니다.",
      "도구 사용 가능 여부와 자동 승인은 다릅니다. 체크된 도구도 CLI·관리자 정책이 차단할 수 있습니다.",
      "허용/거부 규칙은 CLI가 CodePet에 요청한 승인에만 적용합니다. 샌드박스 안에서 승인 없이 실행되는 작업을 차단하는 접근 제어 목록이 아닙니다.",
      "명령은 작업 폴더와 명령 전체가 정확히 일치해야 합니다. 접두사·와일드카드 규칙은 지원하지 않습니다. 같은 명령도 파일 내용이나 환경에 따라 다른 결과를 낼 수 있습니다.",
      "파일 자동 허용은 작업공간 내부의 개별 파일에만 적용합니다. 디렉터리 권한·추가 권한·네트워크 승인은 매번 별도 확인합니다. 겹치는 규칙은 거부가 우선합니다.",
      ...(providerId === "claude" ? ["Claude 도구 끄기는 CLI의 도구 제외 옵션으로 적용합니다. Bash 등 다른 도구를 통한 같은 자원 접근까지 차단하는 것은 아닙니다. 호출별 규칙은 Claude 양방향 승인 연결 후 지원합니다.",
        "MCP·브라우저 연결 추가/선택은 후속 작업입니다. 현재 Claude 실행은 기존 MCP 설정을 제외합니다."] : []),
      ...(providerId === "codex" ? ["Codex 내장 도구의 개별 사용 중지는 아직 지원하지 않습니다. 규칙은 작업공간 쓰기·전체 자동 승인 끔에서만 적용됩니다. MCP·브라우저 연결 관리는 미지원이며 CLI 설정을 자동으로 수정하지 않습니다."] : []),
      ...(autoApprove ? [providerId === "codex" ? "기존 전체 자동 승인은 승인과 샌드박스를 모두 우회합니다. 규칙을 사용하려면 먼저 꺼주세요."
        : "기존 전체 자동 승인은 Claude 권한 확인을 생략합니다. 개별 도구를 활성화하거나 MCP를 연결하는 기능이 아닙니다."] : []),
    ],
  };
}

function validateSettings(input) {
  if (!plain(input) || input.version !== 1 || !plain(input.tools) || !Array.isArray(input.rules)
    || Object.keys(input).some(key => !["version", "tools", "rules"].includes(key)) || input.rules.length > 100) {
    throw new Error("도구 설정 형식 또는 버전을 확인해 주세요(규칙 최대 100개).");
  }
  const tools = {};
  for (const [key, value] of Object.entries(input.tools)) {
    if (!Object.hasOwn(TOOLS, key) || typeof value !== "boolean") throw new Error("알 수 없는 도구 설정입니다.");
    if (!value) tools[key] = false; // Omitted/true both mean available, subject to CLI policy.
  }
  const ids = new Set();
  const rules = input.rules.map(rule => {
    if (!plain(rule) || Object.keys(rule).some(key => !["id", "kind", "effect", "match"].includes(key))
      || typeof rule.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(rule.id) || ids.has(rule.id)
      || !["command", "file"].includes(rule.kind) || !["allow", "deny"].includes(rule.effect)
      || typeof rule.match !== "string" || !rule.match.trim() || rule.match.length > 4000 || /[\x00-\x1f\x7f]/.test(rule.match)) {
      throw new Error("허용 규칙 형식을 확인해 주세요. 빈 값·중복 ID·제어 문자는 사용할 수 없습니다.");
    }
    if (rule.kind === "file" && (!path.isAbsolute(rule.match) || /[*?]/.test(rule.match))) {
      throw new Error("파일 규칙에는 와일드카드 없는 절대 경로를 입력해 주세요.");
    }
    if (rule.kind === "command" && redactSensitiveText(rule.match) !== rule.match) {
      throw new Error("인증 정보가 포함된 명령은 규칙으로 저장할 수 없습니다. 비밀 값은 환경 변수나 CLI 인증으로 전달해 주세요.");
    }
    ids.add(rule.id);
    return { id: rule.id, kind: rule.kind, effect: rule.effect, match: rule.match };
  });
  return { version: 1, tools, rules };
}

// One bounded, atomic, application-owned file. No writes to CLI/account config.
class ToolSettingsStore {
  constructor(store) { this.store = store; this.file = path.join(store.root, "tool-settings.json"); }
  key({ providerId, accountKey, sourceHome, workspace, sessionId }) {
    return hash([providerId, accountKey || null, sourceHome ? canonical(sourceHome) : null,
      workspace ? canonical(workspace) : `session:${sessionId}`]);
  }
  read() {
    try {
      const stat = fs.statSync(this.file);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new Error("size");
      const data = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (data.version !== 1 || !plain(data.entries) || Object.keys(data.entries).length > 256) throw new Error("schema");
      return data;
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, entries: {} };
      throw new Error("CodePet 도구 설정을 읽지 못했습니다. 손상된 설정을 기본 허용으로 대체하지 않습니다.");
    }
  }
  get(key) {
    const entry = this.read().entries[key];
    if (!entry) return { settings: defaults(), revision: hash([key, "default"]) };
    if (typeof entry.revision !== "string") throw new Error("도구 설정 버전을 읽지 못했습니다.");
    return { settings: validateSettings(entry.settings), revision: entry.revision };
  }
  save(key, input, revision, capabilities) {
    if (this.store.readOnly) throw new Error("읽기 전용 저장소입니다.");
    const current = this.get(key);
    if (revision !== current.revision) throw new Error("도구 설정 또는 적용 범위가 변경되었습니다. 다시 불러온 후 저장해 주세요.");
    const settings = validateSettings(input);
    for (const tool of capabilities.tools) {
      if (!tool.supported && (settings.tools[tool.id] ?? true) !== (current.settings.tools[tool.id] ?? true)) {
        throw new Error("현재 공급자·권한 모드에서 이 도구 설정을 바꿀 수 없습니다.");
      }
    }
    for (const rule of settings.rules) {
      if (!capabilities.rules[rule.kind] && !current.settings.rules.some(old => JSON.stringify(old) === JSON.stringify(rule))) {
        throw new Error("현재 공급자·권한 모드에서는 이 승인 규칙을 지원하지 않습니다.");
      }
    }
    const data = this.read();
    if (!data.entries[key] && Object.keys(data.entries).length >= 256) throw new Error("저장할 수 있는 도구 설정 범위 수를 초과했습니다.");
    data.entries[key] = { settings, revision: randomUUID() };
    if (Buffer.byteLength(JSON.stringify(data, null, 2)) > 4 * 1024 * 1024) throw new Error("도구 설정 저장 용량을 초과했습니다.");
    writeJsonAtomic(this.file, data);
    return data.entries[key];
  }
}

function applyToolSettings(invocation, providerId, settings) {
  if (!invocation.ok || providerId !== "claude") return invocation;
  const excluded = Object.keys(TOOLS).filter(id => settings.tools[id] === false);
  return excluded.length ? { ...invocation, argv: [...invocation.argv, "--disallowedTools", excluded.join(",")] } : invocation;
}

function safeLocalFile(file, workspace) {
  const root = canonical(workspace), target = canonical(file), relative = path.relative(root, target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  // An allow rule for a lexical path must not follow a link/reparse point elsewhere.
  try {
    if (canonical(fs.realpathSync(workspace)) !== root) return false;
    let parent = root;
    const segments = relative.split(path.sep);
    for (let i = 0; i < segments.length; i++) {
      parent = path.join(parent, segments[i]);
      try {
        const stat = fs.lstatSync(parent);
        if (stat.isSymbolicLink() || (i === segments.length - 1 && (!stat.isFile() || stat.nlink > 1))) return false;
      } catch (error) { if (error.code !== "ENOENT" || i !== segments.length - 1) return false; }
    }
    return true;
  } catch { return false; }
}

function evaluateApproval(settings, target, workspace) {
  if (!workspace || !target || !path.isAbsolute(target.cwd || "") || canonical(target.cwd) !== canonical(workspace)) return null;
  const rules = settings.rules;
  if (target.kind === "command" && typeof target.command === "string" && !target.network) {
    const matched = rules.filter(rule => rule.kind === "command" && rule.match === target.command);
    const deny = matched.find(rule => rule.effect === "deny");
    if (deny) return deny;
    if (target.additionalPermissions || target.grantRoot) return null;
    return matched.find(rule => rule.effect === "allow") || null;
  }
  if (target.kind !== "file" || !Array.isArray(target.paths) || !target.paths.length
    || target.paths.some(file => typeof file !== "string" || !path.isAbsolute(file))) return null;
  const perFile = target.paths.map(file => rules.filter(rule => rule.kind === "file" && canonical(rule.match) === canonical(file)));
  const deny = perFile.flat().find(rule => rule.effect === "deny");
  if (deny) return deny;
  if (target.grantRoot || target.additionalPermissions || target.paths.some(file => !safeLocalFile(file, workspace))) return null;
  const allowed = perFile.map(matched => matched.find(rule => rule.effect === "allow"));
  return allowed.every(Boolean) ? allowed[0] : null;
}

module.exports = { ToolSettingsStore, settingsCapabilities, validateSettings, applyToolSettings, evaluateApproval, defaults };

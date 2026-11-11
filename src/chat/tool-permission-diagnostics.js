const fs = require("node:fs/promises");
const path = require("node:path");
const { buildAgentInvocation } = require("./chat-argv");
const { approvalTransport } = require("./codex-approval-runner");
const { claudeApprovalTransport } = require("./claude-approval-runner");

const MAX_SETTINGS_BYTES = 256 * 1024;
const TOOL_NAMES = new Set(["Read", "Write", "Edit", "MultiEdit", "Grep", "Glob", "Bash", "PowerShell", "WebSearch", "WebFetch", "Agent", "Task"]);

// Read a bounded inventory, never credentials, rule arguments, hooks or env values.
// These files are candidates, not proof of the CLI's merged/effective configuration.
async function inspectSettings(file, scope) {
  const result = { path: file, scope, status: "missing" };
  let handle;
  try {
    handle = await fs.open(file, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) return { ...result, status: "not-file" };
    if (stat.size > MAX_SETTINGS_BYTES) return { ...result, status: "too-large" };
    const buffer = Buffer.alloc(MAX_SETTINGS_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_SETTINGS_BYTES) return { ...result, status: "too-large" };
    if (!file.endsWith(".json")) return { ...result, status: "present", inventoryOnly: true };
    const settings = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8").replace(/^\uFEFF/, ""));
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { ...result, status: "invalid" };
    const rules = {};
    for (const kind of ["allow", "ask", "deny"]) {
      const values = settings.permissions?.[kind];
      if (values === undefined) continue;
      if (!Array.isArray(values) || values.some(value => typeof value !== "string")) return { ...result, status: "invalid" };
      const tools = new Set();
      for (const value of values) {
        const name = value.split("(", 1)[0];
        if (TOOL_NAMES.has(name)) tools.add(name);
        else if (name.startsWith("mcp__")) tools.add("MCP");
      }
      rules[kind] = { count: values.length, tools: [...tools].sort() };
    }
    return { ...result, status: "present", rules };
  } catch (error) {
    return { ...result, status: error.code === "ENOENT" ? "missing" : error instanceof SyntaxError ? "invalid" : "unreadable" };
  } finally {
    await handle?.close();
  }
}

async function diagnoseToolPermissions({ record, config = {}, permissionMode = "chat", workspace, chatCwd,
  sourceHome, runtimeHome, inheritedFrom, platform = process.platform }) {
  const providerId = record.providerId || record.id;
  if (!["claude", "codex"].includes(providerId)) throw new Error("이 공급자의 도구·권한 진단은 아직 지원하지 않습니다.");
  const autoApprove = permissionMode === "workspace-write" && Boolean(config.autoApprove);
  const invocation = buildAgentInvocation({ provider: { ...record, id: providerId }, permissionMode,
    workspace, chatCwd, autoApprove, model: config.model, effort: config.effort });
  const argv = invocation.ok ? invocation.argv : [];
  const valueAfter = flag => argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null;
  const bypass = argv.includes("--dangerously-bypass-approvals-and-sandbox");
  const skipsPermissions = argv.includes("--dangerously-skip-permissions");
  const appServer = approvalTransport(providerId, permissionMode, autoApprove);
  const claudeStdio = claudeApprovalTransport(providerId, permissionMode, autoApprove);
  const paths = new Map();
  function add(home, scope, names) {
    if (!home || !path.isAbsolute(home)) return;
    for (const name of names) {
      const file = path.join(home, name);
      if (!paths.has(file)) paths.set(file, scope);
    }
  }
  const homeFiles = providerId === "claude" ? ["settings.json", "settings.local.json", "managed-settings.json"]
    : ["config.toml", "managed_config.toml", "requirements.toml"];
  add(sourceHome, "선택 계정 설정 후보", homeFiles);
  if (inheritedFrom && inheritedFrom !== sourceHome) add(inheritedFrom, "계정 초기화 시 상속 원본 후보", homeFiles);
  if (workspace && permissionMode !== "chat") add(workspace, "프로젝트 설정 후보", providerId === "claude"
    ? [".claude/settings.json", ".claude/settings.local.json"] : [".codex/config.toml"]);

  return {
    providerId, version: record.version || null, cliStatus: record.status,
    authentication: ["authenticated", "unauthenticated"].includes(record.authStatus) ? record.authStatus : "unknown",
    permissionMode, autoApprove, sourceHome: sourceHome || null, runtimeHome: runtimeHome || sourceHome || null,
    launch: { ready: invocation.ok, transport: appServer ? "app-server" : claudeStdio ? "claude-stdio" : "exec", approval: !invocation.ok ? "unavailable" : appServer ? "on-request" : bypass || skipsPermissions ? "bypass"
      : valueAfter("--permission-mode") || "cli-default", sandbox: !invocation.ok ? "unknown"
      : bypass ? "disabled" : valueAfter("--sandbox") || "not-set-by-codepet",
    tools: valueAfter("--tools"), mcp: !invocation.ok ? "unknown" : argv.includes("--strict-mcp-config") ? "excluded-by-codepet" : "not-verified" },
    settings: await Promise.all([...paths].map(([file, scope]) => inspectSettings(file, scope))),
    checks: { network: "not-probed", githubAuthentication: "not-probed", windowsSandbox: platform === "win32" && providerId === "codex" ? "not-probed" : "not-applicable" },
    notes: [
      "조회 시점 기준, 다음 일반 턴에 CodePet이 전달할 옵션과 설정 파일 후보입니다. 설정을 바꿨다면 다시 확인하세요. 실행 중인 턴에는 적용되지 않습니다.",
      "CLI가 합산한 최종 권한은 미확인입니다. 상위 폴더·관리자 정책·외부 설정과 TOML 내용은 이 진단에서 해석하지 않습니다.",
      "네트워크·TLS·GitHub 인증·Windows 샌드박스 실행은 검사하지 않았습니다. 문제 해결을 위해 자동 승인을 변경하지 않습니다.",
      ...(appServer ? ["작업공간 쓰기와 자동 승인 끔에서는 App Server가 요청하는 호출을 개별 승인합니다. 모든 도구 사용마다 승인을 요청한다는 뜻은 아닙니다."] : []),
      ...(claudeStdio ? ["작업공간 쓰기와 자동 승인 끔에서는 Claude의 기본 승인 모드·양방향 stdio를 사용합니다. 기존 CLI/관리자 규칙이 먼저 결정한 호출은 CodePet에 요청되지 않을 수 있습니다."] : []),
      ...(config.autoApprove && !autoApprove ? ["저장된 자동 승인은 현재 권한 모드에서 적용되지 않습니다."] : []),
      ...(!invocation.ok ? ["현재 설정으로 실행 인자를 만들 수 없습니다. CLI 상태·워크스페이스·모델 설정을 확인하세요."] : []),
    ],
  };
}

module.exports = { diagnoseToolPermissions, inspectSettings, MAX_SETTINGS_BYTES };

const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { redactSensitiveText } = require("./chat-run-diagnostics");

function claudeApprovalTransport(providerId, permissionMode, autoApprove) {
  return providerId === "claude" && permissionMode === "workspace-write" && !autoApprove;
}

// Native CLI's SDK stdio protocol: no SDK dependency, API key conversion or
// replacement system prompt. Existing CLI/account settings still have priority.
function runClaudeApprovalTurn(options) {
  const { prompt, cwd, requestApproval, onEvent = () => {}, initializeTimeoutMs = 60_000 } = options;
  const initId = randomUUID();
  const excludedIndex = (options.argv || []).indexOf("--disallowedTools");
  const excluded = new Set(excludedIndex < 0 ? [] : String(options.argv[excludedIndex + 1] || "").split(","));
  const resumeIndex = (options.argv || []).indexOf("--resume");
  const expectedSession = resumeIndex < 0 ? null : options.argv[resumeIndex + 1];
  const pending = new Map(), seen = new Set(), tasks = new Set();
  let channel, initialized = false, sessionId, resultSeen = false, state = null, timer;
  let appliedPermissions;
  const safe = value => {
    const text = redactSensitiveText(String(value || ""));
    return text.length > 4000 ? `${text.slice(0, 4000)}…(일부 생략)` : text;
  };
  function maybeEnd() {
    if (resultSeen && !pending.size && !tasks.size && (state === null || state === "idle")) channel.end();
  }
  function respond(id, response) {
    channel.send({ type: "control_response", response: { subtype: "success", request_id: id, response } });
  }
  function deny(id, message) { respond(id, { behavior: "deny", message }); }
  async function permission(message) {
    const id = message.request_id, request = message.request || {};
    if (typeof id !== "string" || !id || id.length > 256) throw new Error("Claude 승인 요청 ID를 확인하지 못했습니다.");
    if (seen.has(id)) return;
    if (!initialized || !sessionId || resultSeen && state === "idle" && !tasks.size) throw new Error("비활성 Claude 실행의 승인 요청입니다.");
    if (seen.size >= 4096) for (const old of seen) { if (!pending.has(old)) { seen.delete(old); break; } }
    seen.add(id);
    if (pending.size >= 64) { deny(id, "대기 중인 승인 요청이 너무 많습니다."); return; }
    if (request.subtype !== "can_use_tool") {
      channel.send({ type: "control_response", response: { subtype: "error", request_id: id, error: "CodePet does not support this control request" } });
      return;
    }
    const tool = request.tool_name, input = request.input;
    if (!input || typeof input !== "object" || Array.isArray(input) || typeof request.tool_use_id !== "string" || !request.tool_use_id) {
      deny(id, "도구 입력 또는 호출 ID를 확인하지 못했습니다."); return;
    }
    const known = ["Bash", "Read", "Edit", "Write", "Grep", "Glob", "WebSearch", "WebFetch", "NotebookEdit"];
    if (!known.includes(tool) || excluded.has(tool)) {
      deny(id, "이 도구의 사용자 입력/승인 형식은 CodePet에서 아직 지원하지 않습니다.");
      onEvent({ kind: "status", label: "지원하지 않는 Claude 도구 승인 요청을 거부했습니다." });
      return;
    }
    const command = tool === "Bash";
    const file = ["Write", "Edit"].includes(tool);
    const filePath = input.file_path || input.notebook_path;
    if (command && (typeof input.command !== "string" || !input.command.trim())
      || file && (typeof filePath !== "string" || !path.isAbsolute(filePath))) {
      deny(id, "명령 또는 파일 대상을 확인하지 못했습니다."); return;
    }
    const target = { kind: command ? "command" : file ? "file" : "other", cwd,
      command: command ? input.command : undefined, paths: file ? [filePath] : undefined,
      additionalPermissions: input.dangerouslyDisableSandbox || request.blocked_path ? true : undefined };
    let description = "입력 본문은 승인 카드에 복사하지 않습니다.";
    if (tool === "WebFetch") {
      try { const url = new URL(input.url); description = `웹 대상: ${safe(url.origin + url.pathname)} (쿼리·인증 값 생략)`; }
      catch { deny(id, "웹 주소를 확인하지 못했습니다."); return; }
    } else if (tool === "WebSearch") description = `검색어: ${safe(input.query)}`;
    else if (["Grep", "Glob"].includes(tool)) description = `검색 경로: ${safe(input.path || cwd)}`;
    const detail = [`도구: ${tool}`,
      command ? `명령: ${safe(input.command)}` : filePath ? `대상: ${safe(filePath)}` : description,
      `CLI 시작 폴더: ${safe(cwd)}`,
      request.blocked_path ? `추가 접근 대상: ${safe(request.blocked_path)}` : "",
      input.dangerouslyDisableSandbox ? "추가 실행 권한: 이번 호출은 샌드박스 해제를 요청합니다." : "",
      "기본 허용은 이번 도구 호출에만 응답합니다. 전역/CLI 허용 규칙을 추가하거나 전체 작업을 재실행하지 않습니다.",
      "파일 본문·변경 내용·비공개 추론은 표시하지 않습니다. 미리보기의 비밀 값은 제거됩니다."].filter(Boolean).join("\n");
    const controller = new AbortController();
    pending.set(id, controller);
    onEvent({ kind: "status", label: "Claude 도구 실행 승인을 기다리고 있습니다." });
    try {
      const approved = await requestApproval({ summary: `Claude ${tool} 실행 승인`, detail, target,
        signal: AbortSignal.any([controller.signal, channel.signal]) });
      if (channel.signal.aborted || controller.signal.aborted) return;
      // Preserve the original input byte-for-byte as data; do not accept suggested
      // permission updates, tool substitutions, or session-wide amendments.
      if (approved) respond(id, { behavior: "allow", updatedInput: input });
      else deny(id, "사용자가 이번 도구 호출을 거부했거나 승인이 만료되었습니다.");
    } finally { pending.delete(id); maybeEnd(); }
  }
  const protocol = {
    start(value) {
      channel = value;
      timer = setTimeout(() => channel.fail(new Error("Claude 양방향 승인 초기화 시간이 초과되었습니다.")), initializeTimeoutMs);
      timer.unref?.();
      channel.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        for (const controller of pending.values()) controller.abort();
      }, { once: true });
      channel.send({ type: "control_request", request_id: initId, request: { subtype: "initialize", hooks: null } });
    },
    onLine(line) {
      let event;
      try { event = JSON.parse(line); } catch { return false; }
      if (!event || typeof event !== "object") return false;
      if (event.type === "control_response") {
        const response = event.response;
        if (response?.request_id !== initId || initialized) return true;
        if (response.subtype !== "success") throw new Error(`Claude 승인 초기화 실패: ${safe(response.error)}`);
        initialized = true; clearTimeout(timer);
        channel.send({ type: "user", session_id: "", message: { role: "user", content: prompt }, parent_tool_use_id: null });
        return true;
      }
      if (event.type === "control_cancel_request") { pending.get(event.request_id)?.abort(); return true; }
      if (event.type === "control_request") {
        permission(event).catch(error => channel.fail(new Error(safe(error.message)))); return true;
      }
      if (event.type === "system" && event.subtype === "init") {
        if (!initialized) throw new Error("Claude 승인 초기화가 완료되지 않았습니다.");
        sessionId = event.session_id;
        if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)
          || expectedSession && sessionId !== expectedSession) throw new Error("Claude 대화 재개 정보를 확인하지 못했습니다.");
        const canonical = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
        if (typeof event.cwd !== "string" || !path.isAbsolute(event.cwd) || canonical(event.cwd) !== canonical(cwd)) {
          throw new Error("Claude CLI가 선택한 작업 폴더를 적용하지 못했습니다. CLI 래퍼의 폴더 변경 여부를 확인해 주세요.");
        }
        if (event.permissionMode !== "default") throw new Error("Claude가 요청한 승인 모드를 확인하거나 적용하지 못했습니다.");
        if (event.permissionMode === "default") appliedPermissions = { transport: "claude-stdio", approval: "default",
          sandbox: "not-set-by-codepet", verifiedAt: Date.now() };
      }
      if (event.session_id && sessionId && event.session_id !== sessionId) throw new Error("Claude 실행의 세션 ID가 일치하지 않습니다.");
      if (event.type === "system" && event.subtype === "session_state_changed") { state = event.state; maybeEnd(); return true; }
      if (event.type === "system") {
        if (event.subtype === "task_started" && ["local_agent", "local_workflow"].includes(event.task_type)) tasks.add(event.task_id);
        if (event.subtype === "task_notification" || event.subtype === "task_updated" && ["completed", "failed", "stopped"].includes(event.patch?.status)) tasks.delete(event.task_id);
        queueMicrotask(maybeEnd);
      }
      if (["assistant", "stream_event"].includes(event.type) && !event.parent_tool_use_id) resultSeen = false;
      if (event.type === "result") {
        if (!initialized) throw new Error("Claude 승인 프로토콜 없이 결과가 도착했습니다.");
        resultSeen = true;
        // Let the existing parser see the result before EOF can trigger close.
        queueMicrotask(maybeEnd);
      }
      return false;
    },
  };
  // Lazy lookup keeps process injection/test fixtures compatible with the existing runner.
  const run = require("./chat-agent-runner").runAgentProcess({ ...options, env: { ...(options.env || process.env),
    CLAUDE_CODE_SDK_READS_SESSION_STATE: "1" }, stdioProtocol: protocol });
  return { ...run, promise: run.promise.then(result => {
    if (result.ok && (!initialized || !resultSeen)) return { ...result, ok: false, status: "failed",
      error: "Claude의 승인 초기화 또는 최종 결과를 확인하지 못했습니다." };
    return { ...result, ...(appliedPermissions ? { appliedPermissions } : {}) };
  }).finally(() => clearTimeout(timer)) };
}

module.exports = { runClaudeApprovalTurn, claudeApprovalTransport };

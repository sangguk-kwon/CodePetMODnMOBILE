const path = require("node:path");
const { CodexLiveRpc } = require("../live/codex-live-rpc");
const { redactSensitiveText, buildRunDiagnostics } = require("./chat-run-diagnostics");

function approvalTransport(providerId, permissionMode, autoApprove) {
  return providerId === "codex" && permissionMode === "workspace-write" && !autoApprove;
}

function workspacePolicy(cwd) {
  return { type: "workspaceWrite", writableRoots: [cwd], networkAccess: false,
    excludeTmpdirEnvVar: true, excludeSlashTmp: true };
}

function runCodexApprovalTurn({ commandPath, needsShell, env, cwd, argv = [], prompt, cliSessionId,
  model, effort, imagePaths = [], parseLine, onEvent = () => {}, requestApproval,
  timeoutMs, rpcFactory = options => new CodexLiveRpc(options) }) {
  let rpc, threadId, turnId, turnStarting = false, settled = false, cancelled = false;
  let answer = "", lastError = "", appliedModel, appliedPermissions;
  let deniedRequest = false;
  let resolveResult;
  let timer;
  const controller = new AbortController();
  const items = new Map(), requests = new Set(), pendingRequests = new Map();
  const promise = new Promise(resolve => { resolveResult = resolve; });
  const safe = value => {
    const redacted = redactSensitiveText(String(value || ""));
    return redacted.length > 4000 ? `${redacted.slice(0, 4000)}…(일부 생략)` : redacted;
  };
  const emit = event => { if (!settled) onEvent(event); };
  const feed = event => {
    if (settled) return;
    const parsed = parseLine?.(JSON.stringify(event));
    if (parsed?.kind === "final") answer = parsed.text;
    if (parsed?.kind === "error") lastError = parsed.message;
    if (parsed) emit(parsed);
  };
  function finish(result) {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    controller.abort();
    try { rpc?.close(); } catch { /* Cancellation must still settle the caller. */ }
    const diagnostics = buildRunDiagnostics({ provider: "codex", lastError: result.error });
    Promise.resolve().then(() => parseLine?.flushTraces?.()).then(() => resolveResult({ ...result, diagnostics,
      ...(appliedModel ? { appliedModel } : {}), ...(appliedPermissions ? { appliedPermissions } : {}) }),
    () => resolveResult({ ok: false, error: "도구 실행 기록을 저장하지 못했습니다.", diagnostics }));
  }
  function respond(message, result) {
    if (!settled && !rpc.closed) rpc.send({ id: message.id, result });
  }
  function matching(params) {
    return params?.threadId === threadId && typeof turnId === "string" && params.turnId === turnId;
  }
  async function serverRequest(message) {
    if (settled || requests.has(message.id)) return;
    requests.add(message.id);
    const params = message.params || {};
    const command = message.method === "item/commandExecution/requestApproval";
    const file = message.method === "item/fileChange/requestApproval";
    if (!matching(params)) {
      rpc.send({ id: message.id, error: { code: -32602, message: "Inactive thread or turn" } });
      return;
    }
    if (message.method === "item/permissions/requestApproval") {
      respond(message, { permissions: {}, scope: "turn" });
      emit({ kind: "status", label: "추가 파일·네트워크 권한 요청은 아직 지원하지 않아 거부했습니다." });
      return;
    }
    if (!command && !file) {
      // Questions, elicitation and dynamic tools need their own UI contract.
      rpc.send({ id: message.id, error: { code: -32601, message: "This request is not supported by CodePet" } });
      emit({ kind: "status", label: "현재 지원하지 않는 Codex 사용자 입력 요청입니다." });
      return;
    }
    if (typeof params.itemId !== "string" || !params.itemId) { respond(message, { decision: "decline" }); return; }
    const network = params.networkApprovalContext;
    const item = items.get(params.itemId);
    if ((command && !network && !(params.command || item?.command))
      || (network && typeof network.host !== "string")
      || (file && !item?.changes?.length && !params.grantRoot)) {
      respond(message, { decision: "decline" });
      emit({ kind: "status", label: "명령 또는 변경 대상 정보를 확인할 수 없어 요청을 거부했습니다." });
      return;
    }
    // Never return acceptForSession or persistent exec/network amendments.
    const detail = [
      command ? network ? `네트워크 대상: ${safe(network.host)} (${safe(network.protocol)})`
        : `명령: ${safe(params.command || item?.command) || "명령 정보 없음"}`
        : `변경 파일: ${(item?.changes || []).slice(0, 20).map(change => safe(change.path)).join("\n") || "파일 목록 미제공"}`,
      `작업 폴더: ${safe(params.cwd || cwd)}`,
      params.reason ? `요청 이유: ${safe(params.reason)}` : "",
      file && params.grantRoot ? `요청 경로: ${safe(params.grantRoot)}` : "",
      network ? "이 네트워크 승인 요청에 연결된 동일 대상의 대기 작업이 함께 해제될 수 있습니다." : "",
      "이번 요청에만 응답합니다. 세션 허용 규칙을 저장하거나 전체 작업을 재시작하지 않습니다.",
      "표시 내용은 비밀 값이 제거된 미리보기입니다.",
    ].filter(Boolean).join("\n");
    emit({ kind: "status", label: "도구 실행 승인을 기다리고 있습니다." });
    const callController = new AbortController();
    pendingRequests.set(message.id, callController);
    let approved;
    try {
      approved = await requestApproval({ summary: network ? "네트워크 요청 승인" : file ? "파일 변경 승인" : "명령 실행 승인",
        detail, signal: AbortSignal.any([controller.signal, callController.signal]),
        target: { kind: command ? "command" : "file", command: params.command || item?.command,
          cwd: params.cwd || item?.cwd || cwd, paths: (item?.changes || []).map(change => change.path),
          network: Boolean(network), grantRoot: params.grantRoot,
          additionalPermissions: params.additionalPermissions } });
    } finally { pendingRequests.delete(message.id); }
    if (settled || callController.signal.aborted) return;
    if (!approved) deniedRequest = true;
    if (Array.isArray(params.availableDecisions) && !params.availableDecisions.includes(approved ? "accept" : "decline")) {
      respond(message, { decision: "cancel" });
    } else respond(message, { decision: approved ? "accept" : "decline" });
  }
  function notification({ method, params: p = {} }) {
    if (settled || p.threadId !== threadId) return;
    if (method === "serverRequest/resolved") { pendingRequests.get(p.requestId)?.abort(); return; }
    if (method === "turn/started" && turnStarting && !turnId) turnId = p.turn?.id;
    const incomingTurn = p.turnId || p.turn?.id;
    if (!turnId || incomingTurn !== turnId) return;
    if (method === "item/agentMessage/delta") { emit({ kind: "delta", text: String(p.delta || "") }); return; }
    if (method === "error") {
      if (!p.willRetry) lastError = safe(p.error?.message);
      return;
    }
    if (method === "item/started" || method === "item/completed") {
      const item = p.item;
      if (!item || typeof item.id !== "string") return;
      if (["commandExecution", "fileChange"].includes(item.type) && method === "item/started") {
        if (items.size >= 256) items.delete(items.keys().next().value);
        items.set(item.id, item);
      }
      const type = { agentMessage: "agent_message", commandExecution: "command_execution", fileChange: "file_change",
        mcpToolCall: "mcp_tool_call", webSearch: "web_search", reasoning: "reasoning" }[item.type];
      if (!type) return;
      // Only reasoning lifecycle metadata is forwarded; never its content/summary.
      const converted = item.type === "reasoning" ? { id: item.id, type } : { ...item, type,
        aggregated_output: item.aggregatedOutput, exit_code: item.exitCode };
      feed({ type: method === "item/started" ? "item.started" : "item.completed", item: converted });
      if (method === "item/completed") items.delete(item.id);
    }
    if (method === "turn/completed") {
      const status = p.turn?.status;
      if (status === "interrupted" && deniedRequest) {
        finish({ ok: false, text: answer, status: "denied", error: "도구 실행 요청을 거부하여 현재 작업이 종료되었습니다." });
        return;
      }
      finish({ ok: status === "completed" && !lastError,
        text: answer, status: status === "interrupted" ? "cancelled" : status,
        cancelled: status === "interrupted",
        ...(status === "completed" && !lastError ? {} : { error: safe(p.turn?.error?.message || lastError || "Codex 실행이 종료되었습니다.") }) });
    }
  }
  (async () => {
    rpc = rpcFactory({ command: commandPath, needsShell, env, cwd,
      argv: [...argv, "-c", 'sandbox_mode="workspace-write"', "-c", 'approval_policy="on-request"', "-c", 'approvals_reviewer="user"'] });
    rpc.on("request", message => { serverRequest(message).catch(error => finish({ ok: false, text: answer, error: safe(error.message) })); });
    rpc.on("notification", message => { try { notification(message); } catch (error) { finish({ ok: false, error: safe(error.message) }); } });
    rpc.on("closed", error => { if (!settled) finish({ ok: false, text: answer, error: safe(error.message) }); });
    await rpc.initialize();
    if (settled) return;
    let configured = null;
    try {
      const effective = await rpc.request("config/read", { cwd, includeLayers: false });
      configured = {};
      for (const [key, values] of Object.entries({ approval_policy: ["untrusted", "on-request", "never"], sandbox_mode: ["read-only", "workspace-write", "danger-full-access"] })) {
        if (!values.includes(effective.config?.[key])) continue;
        const origin = effective.origins?.[key]?.name;
        configured[key] = { value: effective.config[key], source: typeof origin?.file === "string" ? safe(origin.file)
          : ["user", "project", "system", "sessionFlags", "packagedDefaults", "mdm", "enterpriseManaged"].includes(origin?.type) ? origin.type : "unknown" };
      }
    } catch { /* Older CLIs can lack config/read. Never invent effective values. */ }
    if (settled) return;
    let permissionProfile;
    try {
      const profiles = await rpc.request("permissionProfile/list", { cwd });
      if (Array.isArray(profiles.data)) {
        permissionProfile = [":workspace", ":workspace-write"].find(id => profiles.data.some(profile => profile.id === id && profile.allowed));
        if (!permissionProfile) throw new Error("Codex의 작업공간 쓰기 프로필이 허용되지 않습니다.");
      }
    } catch (error) { if (error.code !== -32601) throw error; }
    if (settled) return;
    const params = { cwd, approvalPolicy: "on-request", approvalsReviewer: "user",
      ...(permissionProfile ? { permissions: permissionProfile } : { sandbox: "workspace-write" }),
      ...(model && model !== "default" ? { model } : {}) };
    const response = await rpc.request(cliSessionId ? "thread/resume" : "thread/start",
      { ...params, ...(cliSessionId ? { threadId: cliSessionId } : {}) });
    if (settled) return;
    if (response.approvalPolicy !== "on-request" || response.sandbox?.type !== "workspaceWrite" || response.sandbox.networkAccess === true
      || (response.approvalsReviewer && response.approvalsReviewer !== "user")
      || typeof response.cwd !== "string" || !path.isAbsolute(response.cwd)
      || (process.platform === "win32" ? path.resolve(response.cwd).toLowerCase() !== path.resolve(cwd).toLowerCase()
        : path.resolve(response.cwd) !== path.resolve(cwd))) throw new Error("Codex가 요청한 권한·작업 폴더를 적용하지 못했습니다.");
    for (const root of response.sandbox.writableRoots || []) {
      const relative = path.relative(path.resolve(cwd), path.resolve(root));
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Codex가 선택한 작업공간 밖의 쓰기 경로를 적용했습니다.");
    }
    threadId = response.thread?.id;
    if (typeof threadId !== "string" || !threadId || (cliSessionId && threadId !== cliSessionId)) throw new Error("Codex 대화 재개 정보를 확인하지 못했습니다.");
    appliedModel = response.model;
    appliedPermissions = { transport: "app-server", approval: response.approvalPolicy, sandbox: response.sandbox.type,
      requestedTurnNetworkAccess: false, configured, verifiedAt: Date.now() };
    feed({ type: "thread.started", thread_id: threadId });
    turnStarting = true;
    const started = await rpc.request("turn/start", { threadId, cwd, approvalPolicy: "on-request", approvalsReviewer: "user",
      ...(permissionProfile ? { permissions: permissionProfile } : { sandboxPolicy: workspacePolicy(cwd) }),
      input: [{ type: "text", text: prompt }, ...imagePaths.map(file => ({ type: "localImage", path: file }))],
      ...(model && model !== "default" ? { model } : {}), ...(effort && effort !== "default" ? { effort } : {}) });
    if (settled) return;
    if (!started.turn?.id || (turnId && turnId !== started.turn.id)) throw new Error("Codex 실행 ID가 일치하지 않습니다.");
    turnId = started.turn.id;
  })().catch(error => finish({ ok: false, text: answer, error: safe(error.message) }));
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) timer = setTimeout(() => finish({ ok: false, text: answer, error: "Codex 실행 시간이 초과되었습니다." }), timeoutMs);
  return { promise, cancel() {
    if (settled) return;
    cancelled = true;
    if (threadId && turnId && rpc && !rpc.closed) rpc.request("turn/interrupt", { threadId, turnId }, 1000).catch(() => {});
    finish({ ok: false, text: answer, cancelled, status: "cancelled", error: "중지됨" });
  } };
}

module.exports = { runCodexApprovalTurn, approvalTransport, workspacePolicy };

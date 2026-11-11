// Explicit environment choices are separate from approval policy. Missing values
// retain the old checkbox's meaning; merely opening settings never migrates it.
function codexExecution(config = {}, permissionMode = "workspace-write") {
  if (config.codexSandbox !== undefined && !["workspace-write", "danger-full-access"].includes(config.codexSandbox)) {
    throw new Error("알 수 없는 Codex 실행 환경입니다.");
  }
  const automatic = permissionMode === "workspace-write" && Boolean(config.autoApprove);
  const sandbox = permissionMode !== "workspace-write" ? "read-only"
    : config.codexSandbox || (automatic ? "danger-full-access" : "workspace-write");
  if (sandbox === "danger-full-access" && !automatic) {
    throw new Error("제한 없는 실행은 전체 자동 승인에서만 지원합니다. 개별 승인에는 작업공간 제한을 선택하세요.");
  }
  return { sandbox, approval: automatic ? "never" : "on-request",
    legacy: config.codexSandbox === undefined && automatic };
}

function applyExecutionPatch(providerId, next, patch, permissionMode) {
  if (Object.hasOwn(patch || {}, "codexSandbox")) {
    if (providerId !== "codex" || permissionMode !== "workspace-write") {
      throw new Error("실행 환경 변경은 Codex 작업공간 쓰기에서만 지원합니다.");
    }
    next.codexSandbox = patch.codexSandbox;
    // An explicit null/undefined must not remove a saved restriction.
    if (!["workspace-write", "danger-full-access"].includes(next.codexSandbox)) {
      throw new Error("알 수 없는 Codex 실행 환경입니다.");
    }
  } else if (providerId === "codex" && patch?.autoApprove === false && next.codexSandbox === "danger-full-access") {
    next.codexSandbox = "workspace-write";
  }
  if (providerId === "codex") codexExecution(next, permissionMode);
}

module.exports = { codexExecution, applyExecutionPatch };

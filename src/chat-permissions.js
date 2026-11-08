/* global window, document */
// Read-only, on-demand snapshot. Never render configuration contents as HTML.
window.chatPermissions = {
  createPanel({ load, isCurrent }) {
    const panel = document.createElement("details");
    panel.className = "permission-diagnostics";
    const summary = document.createElement("summary");
    summary.textContent = "도구·권한 진단";
    const content = document.createElement("div");
    content.className = "permission-diagnostics-content";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "button";
    refresh.textContent = "다시 확인";
    panel.append(summary, content, refresh);
    let loaded = false;
    let pending = false;
    const labels = {
      "cli-default": "CLI 기본 정책", acceptEdits: "파일 편집 자동 허용", bypass: "승인 생략",
      unavailable: "실행 불가", "read-only": "읽기 전용", "workspace-write": "작업공간 쓰기",
      disabled: "해제", "not-set-by-codepet": "CodePet이 샌드박스를 지정하지 않음", unknown: "미확인",
      present: "파일 확인", missing: "파일 없음", invalid: "잘못된 JSON/규칙 형식",
      unreadable: "읽기 실패", "too-large": "크기 제한 초과", "not-file": "일반 파일 아님",
      authenticated: "CLI 로그인 확인 기록 있음", unauthenticated: "CLI 로그인 필요",
    };
    function line(text, parent = content) {
      const node = document.createElement("p");
      node.textContent = text;
      parent.append(node);
    }
    async function update() {
      if (pending) return;
      pending = true;
      refresh.disabled = true;
      content.replaceChildren();
      line("확인 중…");
      try {
        const result = await load();
        if (!isCurrent() || !panel.isConnected) return;
        content.replaceChildren();
        if (!result?.ok || !result.diagnostics) {
          line(result?.error || "진단을 불러오지 못했습니다.");
          return;
        }
        loaded = true;
        const data = result.diagnostics;
        line(`CLI: ${data.version || "버전 미확인"} · 로그인: ${labels[data.authentication] || "미확인"}`);
        line(`권한 모드: ${data.permissionMode}`);
        line(`CodePet 실행 옵션 · 승인: ${labels[data.launch.approval] || data.launch.approval}`);
        line(`CodePet 실행 옵션 · 샌드박스: ${labels[data.launch.sandbox] || data.launch.sandbox}`);
        if (data.launch.tools !== null) line(`제공 도구: ${data.launch.tools || "없음"}`);
        line(data.launch.mcp === "excluded-by-codepet" ? "MCP: 현재 CodePet 실행 옵션에서 기존 MCP 설정 제외"
          : "MCP 연결: 미확인");
        line(`계정 설정 경로: ${data.sourceHome || "미확인"}`);
        if (data.runtimeHome !== data.sourceHome) line(`실행 시 사용할 격리 경로: ${data.runtimeHome}`);
        for (const file of data.settings) {
          const item = document.createElement("div");
          item.className = "permission-settings-source";
          line(`${file.scope} · ${labels[file.status] || file.status}`, item);
          line(file.path, item);
          if (file.inventoryOnly) line("내용·최종 적용 값 미해석", item);
          for (const [kind, rule] of Object.entries(file.rules || {})) {
            line(`${{ allow: "허용", ask: "확인", deny: "거부" }[kind]} 규칙 ${rule.count}개${rule.tools.length ? ` · ${rule.tools.join(", ")}` : ""}`, item);
          }
          content.append(item);
        }
        for (const note of data.notes) line(note);
      } catch {
        if (isCurrent() && panel.isConnected) {
          content.replaceChildren();
          line("진단을 불러오지 못했습니다. 다시 확인해 주세요.");
        }
      } finally {
        pending = false;
        refresh.disabled = false;
      }
    }
    panel.addEventListener("toggle", () => { if (panel.open && !loaded) update(); });
    refresh.addEventListener("click", update);
    return panel;
  },
};

/* global window, document */
window.chatConversationGrants = {
  createPanel({ load, remove, isCurrent }) {
    const panel = document.createElement("details"); panel.className = "conversation-grants";
    const summary = document.createElement("summary"), body = document.createElement("div");
    summary.textContent = "이 대화에서 허용한 작업"; panel.append(summary, body);
    let busy = false;
    async function refresh() {
      if (busy || !isCurrent()) return; busy = true;
      try {
        const result = await load();
        if (!isCurrent() || !panel.isConnected) return;
        body.replaceChildren();
        const note = document.createElement("p");
        note.textContent = "이 대화의 현재 에이전트·계정·작업 폴더에만 적용되며 앱 재시작 후에도 유지됩니다. 허용 취소는 다음 승인 요청부터 적용하며 이미 실행된 작업을 되돌리지는 않습니다.";
        body.append(note);
        if (!result?.ok) { note.textContent = result?.error || "허용 목록을 읽지 못했습니다."; return; }
        if (!result.grants.length) { const empty = document.createElement("p"); empty.textContent = "저장된 허용 없음"; body.append(empty); }
        for (const grant of result.grants) {
          const row = document.createElement("div"), label = document.createElement("code"), button = document.createElement("button");
          row.className = "conversation-grant"; label.textContent = `${grant.kind === "command" ? "같은 명령" : "이 파일 변경"}: ${grant.match}`;
          button.type = "button"; button.className = "button"; button.textContent = "허용 취소";
          button.addEventListener("click", async () => {
            if (busy || !isCurrent()) return; busy = true; button.disabled = true;
            try {
              const answer = await remove(grant.id, result.scope);
              if (!isCurrent() || !panel.isConnected) return;
              if (answer?.ok) { busy = false; await refresh(); }
              else { note.textContent = answer?.error || "허용을 취소하지 못했습니다."; button.disabled = false; }
            } finally { busy = false; }
          });
          row.append(label, button); body.append(row);
        }
      } finally { busy = false; }
    }
    panel.addEventListener("toggle", () => { if (panel.open) void refresh(); });
    return panel;
  },
};

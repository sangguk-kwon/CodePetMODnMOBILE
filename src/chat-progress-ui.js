/* global window, document */
window.chatProgress = {
  createPanel(initial) {
    const element = document.createElement("details"); element.className = "progress-history";
    const summary = document.createElement("summary"), elapsed = document.createElement("p"), list = document.createElement("ol"), omitted = document.createElement("p");
    elapsed.className = "progress-elapsed"; omitted.className = "progress-omitted";
    element.append(summary, elapsed, list, omitted);
    let data;
    const cats = { read: "파일 조회", search: "파일 검색", edit: "파일 수정", command: "명령 실행", test: "테스트 명령", web: "웹 도구", tool: "도구 실행", thinking: "추론 시작 확인", waiting: "사용자 승인 대기", response: "응답" };
    const states = { running: "진행 중", completed: "완료", failed: "실패", denied: "거부됨", cancelled: "중단됨", unknown: "결과 미확인" };
    function tick() {
      if (!data) return;
      const seconds = Math.max(0, Math.floor(((data.state === "running" ? Date.now() : data.updatedAt) - data.updatedAt) / 1000));
      elapsed.textContent = data.state === "running"
        ? `마지막 확인 ${new Date(data.updatedAt).toLocaleTimeString()} · 이후 ${seconds}초 경과`
        : `마지막 확인 ${new Date(data.updatedAt).toLocaleTimeString()} · ${states[data.state] || "결과 미확인"}`;
    }
    function update(next) {
      if (data && next.sequence <= data.sequence) return;
      data = next; list.replaceChildren();
      summary.textContent = `도구 실행 기록 · ${data.state === "completed" ? "작업 응답 완료" : states[data.state] || "결과 미확인"} · ${data.rows.length}건`;
      for (const row of data.rows) {
        const item = document.createElement("li");
        item.dataset.state = row.state;
        item.textContent = `${new Date(row.at).toLocaleTimeString()} · ${cats[row.category] || "도구 실행"} · ${states[row.state] || "결과 미확인"}${Number.isSafeInteger(row.exitCode) ? ` (종료 코드 ${row.exitCode})` : ""}`;
        if (row.count > 1) item.textContent += ` · 동일 상태 ${row.count}건 묶음`;
        list.append(item);
      }
      omitted.textContent = data.omitted ? `이전 ${data.omitted}건 생략 · 최근 이력만 표시` : "";
      omitted.hidden = !data.omitted;
      tick();
    }
    update(initial); element.open = false;
    return { element, update, tick };
  },
};

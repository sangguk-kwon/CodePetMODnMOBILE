/* global window, document */
// CodePet-owned tool availability and exact-call approval rules. Text via DOM only.
window.chatToolSettings = {
  createPanel({ load, save, isCurrent }) {
    const MAX_RULES = 100;
    const MAX_MATCH = 4000;
    const panel = document.createElement("details");
    panel.className = "tool-settings";
    const summary = document.createElement("summary");
    summary.textContent = "도구·허용 규칙";
    const body = document.createElement("div");
    body.className = "tool-settings-body";
    panel.append(summary, body);

    const status = document.createElement("p");
    status.className = "tool-settings-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const scope = document.createElement("p");
    scope.className = "popover-hint";
    scope.textContent = "적용 범위: 이 참가자의 계정·공급자·작업공간 (CodePet 내부 저장, 전역 CLI 설정 변경 없음)";

    const applyHint = document.createElement("p");
    applyHint.className = "popover-hint";
    applyHint.textContent = "저장 후 다음 실행부터 적용됩니다. 같은 범위의 실행이 진행 중이면 저장이 거부됩니다. "
      + "설정이 바뀌면 새 CLI 세션으로 시작하고 최근 대화를 이어 붙일 수 있습니다.";

    // 폼 전체를 fieldset으로 묶어 처리 중에는 한 번에 비활성화한다. (중첩 form 없음)
    const form = document.createElement("fieldset");
    form.className = "tool-settings-form";
    form.disabled = true;

    const toolsSection = document.createElement("fieldset");
    toolsSection.className = "tool-settings-section";
    const toolsLegend = document.createElement("legend");
    toolsLegend.textContent = "사용 가능 도구";
    const toolsHint = document.createElement("p");
    toolsHint.className = "popover-hint";
    toolsHint.textContent = "체크 해제한 도구는 CLI에 제공하지 않습니다. 사용 가능은 자동 승인이 아닙니다.";
    const toolsList = document.createElement("div");
    toolsList.className = "tool-settings-tools";
    toolsSection.append(toolsLegend, toolsHint, toolsList);

    const rulesSection = document.createElement("fieldset");
    rulesSection.className = "tool-settings-section";
    const rulesLegend = document.createElement("legend");
    rulesLegend.textContent = "승인 규칙";
    const rulesHint = document.createElement("p");
    rulesHint.className = "popover-hint";
    rulesHint.textContent = "CLI가 CodePet에 승인을 요청할 때만 적용합니다. 샌드박스의 모든 작업을 막는 접근 제어가 아닙니다. "
      + "거부가 우선합니다. 명령은 전체가 정확히 일치해야 하며(접두사·와일드카드 없음), 파일은 절대 경로만 사용합니다.";
    const secretHint = document.createElement("p");
    secretHint.className = "popover-hint is-warning";
    secretHint.textContent = "명령에 토큰·비밀번호 등 비밀 값을 넣지 마세요. 규칙은 이 PC의 CodePet 설정에 저장됩니다.";
    const ruleList = document.createElement("ul");
    ruleList.className = "tool-settings-rules";
    ruleList.setAttribute("aria-label", "저장할 승인 규칙");

    const addRow = document.createElement("div");
    addRow.className = "tool-settings-add";
    const kindSelect = document.createElement("select");
    kindSelect.setAttribute("aria-label", "규칙 종류");
    const effectSelect = document.createElement("select");
    effectSelect.setAttribute("aria-label", "규칙 동작");
    for (const [value, text] of [["allow", "허용"], ["deny", "거부"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      effectSelect.append(option);
    }
    const matchInput = document.createElement("input");
    matchInput.type = "text";
    matchInput.maxLength = MAX_MATCH;
    matchInput.spellcheck = false;
    matchInput.autocomplete = "off";
    matchInput.setAttribute("aria-label", "일치시킬 명령 또는 파일 경로");
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "button";
    addButton.textContent = "추가";
    const addSelectors = document.createElement("div");
    addSelectors.className = "tool-settings-add-selectors";
    addSelectors.append(kindSelect, effectSelect, addButton);
    addRow.append(addSelectors, matchInput);
    rulesSection.append(rulesLegend, rulesHint, secretHint, ruleList, addRow);

    form.append(toolsSection, rulesSection);

    const notesBox = document.createElement("details");
    notesBox.className = "tool-settings-notes";
    const notesSummary = document.createElement("summary");
    notesSummary.textContent = "적용 범위·제한 설명";
    const notesList = document.createElement("ul");
    notesBox.append(notesSummary, notesList);

    const actions = document.createElement("div");
    actions.className = "tool-settings-actions";
    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.className = "button";
    reloadButton.textContent = "다시 불러오기";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "button button-primary";
    saveButton.textContent = "저장";
    saveButton.disabled = true;
    const dirtyNote = document.createElement("span");
    dirtyNote.className = "tool-settings-dirty";
    dirtyNote.textContent = "저장 안 된 변경 있음";
    dirtyNote.hidden = true;
    actions.append(dirtyNote, reloadButton, saveButton);

    body.append(status, scope, form, applyHint, notesBox, actions);

    let busy = false;
    let loaded = false;
    let saved = null; // { settings, capabilities, revision }
    let draft = null; // { tools, rules }
    let fallbackCounter = 0;

    const clone = (settings) => ({
      tools: { ...(settings?.tools || {}) },
      rules: (settings?.rules || []).map(({ id, kind, effect, match }) => ({ id, kind, effect, match })),
    });
    const toolsPayload = (tools) => {
      const out = {};
      for (const [id, value] of Object.entries(tools)) if (value === false) out[id] = false;
      return out;
    };
    const serialize = (value) => JSON.stringify({ tools: toolsPayload(value.tools), rules: value.rules });
    const isDirty = () => Boolean(saved && draft) && serialize(draft) !== serialize(clone(saved.settings));
    const ruleSupported = (kind) => Boolean(saved?.capabilities?.rules?.[kind]);

    function setStatus(text, tone = "") {
      status.textContent = text;
      status.dataset.tone = tone;
    }

    function newRuleId() {
      const taken = new Set(draft.rules.map((rule) => rule.id));
      for (let attempt = 0; attempt < 5; attempt++) {
        let id = "";
        const cryptoApi = window.crypto;
        if (typeof cryptoApi?.randomUUID === "function") {
          id = cryptoApi.randomUUID();
        } else if (typeof cryptoApi?.getRandomValues === "function") {
          id = Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        } else {
          id = `r-${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}`;
        }
        if (/^[A-Za-z0-9_-]{1,80}$/.test(id) && !taken.has(id)) return id;
      }
      let id;
      do id = `r-${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}`; while (taken.has(id));
      return id;
    }

    function refreshControls() {
      form.disabled = busy || !loaded;
      reloadButton.disabled = busy;
      const dirty = isDirty();
      saveButton.disabled = busy || !loaded || !dirty;
      const anyKind = ruleSupported("command") || ruleSupported("file");
      const full = Boolean(draft) && draft.rules.length >= MAX_RULES;
      kindSelect.disabled = !anyKind || full;
      effectSelect.disabled = !anyKind || full;
      matchInput.disabled = !anyKind || full;
      addButton.disabled = !anyKind || full;
      matchInput.placeholder = !anyKind ? "현재 설정에서 규칙 추가 불가"
        : full ? `규칙은 최대 ${MAX_RULES}개입니다`
          : kindSelect.value === "file" ? "절대 경로 (예: C:\\project\\file.txt)" : "정확한 전체 명령";
      dirtyNote.hidden = !dirty;
    }

    function renderTools() {
      toolsList.replaceChildren();
      const tools = saved?.capabilities?.tools || [];
      if (!tools.length) {
        const empty = document.createElement("p");
        empty.className = "popover-hint";
        empty.textContent = "조정할 수 있는 도구 정보가 없습니다.";
        toolsList.append(empty);
        return;
      }
      for (const tool of tools) {
        const label = document.createElement("label");
        label.className = "tool-settings-tool";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = draft.tools[tool.id] !== false;
        box.disabled = !tool.supported;
        box.addEventListener("change", () => {
          if (!tool.supported) return;
          if (box.checked) delete draft.tools[tool.id];
          else draft.tools[tool.id] = false;
          markEdited();
        });
        const text = document.createElement("span");
        text.textContent = `${tool.label || tool.id} (${tool.id})${tool.supported ? "" : " · 변경 불가"}`;
        label.append(box, text);
        if (!tool.supported) label.classList.add("is-disabled");
        toolsList.append(label);
      }
    }

    function renderRules() {
      ruleList.replaceChildren();
      if (!draft.rules.length) {
        const empty = document.createElement("li");
        empty.className = "tool-settings-empty";
        empty.textContent = "규칙 없음 · 승인 요청은 매번 확인합니다.";
        ruleList.append(empty);
      }
      for (const rule of draft.rules) {
        const item = document.createElement("li");
        item.className = "tool-settings-rule";
        item.dataset.effect = rule.effect;
        const meta = document.createElement("span");
        meta.className = "tool-settings-rule-meta";
        const kindText = rule.kind === "file" ? "파일" : "명령";
        const effectText = rule.effect === "deny" ? "거부" : "허용";
        meta.textContent = `${effectText} · ${kindText}${ruleSupported(rule.kind) ? "" : " · 현재 미적용"}`;
        const match = document.createElement("code");
        match.className = "tool-settings-rule-match";
        match.textContent = rule.match;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "button tool-settings-remove";
        remove.textContent = "삭제";
        remove.setAttribute("aria-label", `${effectText} ${kindText} 규칙 삭제: ${rule.match.slice(0, 120)}`);
        remove.addEventListener("click", () => {
          draft.rules = draft.rules.filter((entry) => entry.id !== rule.id);
          renderRules();
          markEdited();
        });
        item.append(meta, remove, match);
        ruleList.append(item);
      }
      ruleList.setAttribute("aria-label", `저장할 승인 규칙 ${draft.rules.length}개`);
    }

    function renderKinds() {
      const previous = kindSelect.value;
      kindSelect.replaceChildren();
      for (const [value, text] of [["command", "명령"], ["file", "파일"]]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = ruleSupported(value) ? text : `${text} (미지원)`;
        option.disabled = !ruleSupported(value);
        kindSelect.append(option);
      }
      const usable = [previous, "command", "file"].find((value) => ruleSupported(value));
      kindSelect.value = usable || "command";
    }

    function renderNotes() {
      notesList.replaceChildren();
      for (const note of saved?.capabilities?.notes || []) {
        const item = document.createElement("li");
        item.textContent = String(note);
        notesList.append(item);
      }
      notesBox.hidden = !notesList.childElementCount;
    }

    function renderAll() {
      renderTools();
      renderKinds();
      renderRules();
      renderNotes();
      refreshControls();
    }

    function markEdited() {
      if (status.dataset.tone === "error" || status.dataset.tone === "saved") setStatus("", "");
      refreshControls();
    }

    function validateNewRule(kind, match) {
      if (!ruleSupported(kind)) return "현재 설정에서 이 종류의 규칙은 지원하지 않습니다.";
      if (draft.rules.length >= MAX_RULES) return `규칙은 최대 ${MAX_RULES}개입니다.`;
      if (!match.trim()) return "명령 또는 경로를 입력해 주세요.";
      if (match.length > MAX_MATCH) return `최대 ${MAX_MATCH}자까지 입력할 수 있습니다.`;
      if (/[\x00-\x1f\x7f]/.test(match)) return "줄바꿈·제어 문자는 사용할 수 없습니다.";
      if (kind === "file") {
        if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(match)) return "파일 규칙에는 절대 경로를 입력해 주세요.";
        if (/[*?]/.test(match)) return "파일 경로에 * 또는 ?는 사용할 수 없습니다.";
      }
      return "";
    }

    function addRule() {
      if (busy || !loaded || !isCurrent() || !panel.isConnected) return;
      const kind = kindSelect.value;
      const effect = effectSelect.value === "deny" ? "deny" : "allow";
      const match = matchInput.value; // 공백은 명령의 일부이므로 자르지 않는다.
      const problem = validateNewRule(kind, match)
        || (draft.rules.some((rule) => rule.kind === kind && rule.effect === effect && rule.match === match)
          ? "같은 규칙이 이미 있습니다." : "");
      if (problem) {
        setStatus(problem, "error");
        matchInput.focus();
        return;
      }
      draft.rules.push({ id: newRuleId(), kind, effect, match });
      matchInput.value = "";
      renderRules();
      setStatus("", "");
      refreshControls();
      matchInput.focus();
    }

    async function update() {
      if (busy || !isCurrent() || !panel.isConnected) return;
      busy = true;
      setStatus("불러오는 중…", "busy");
      refreshControls();
      try {
        const result = await load();
        if (!isCurrent() || !panel.isConnected) return;
        if (!result?.ok || !result.settings || !result.capabilities) {
          setStatus(result?.error || "도구 설정을 불러오지 못했습니다.", "error");
          return;
        }
        saved = { settings: result.settings, capabilities: result.capabilities, revision: result.revision };
        draft = clone(result.settings);
        loaded = true;
        setStatus("", "");
      } catch {
        if (isCurrent() && panel.isConnected) setStatus("도구 설정을 불러오지 못했습니다. 다시 불러와 주세요.", "error");
      } finally {
        busy = false;
        if (panel.isConnected) {
          if (loaded) renderAll();
          else refreshControls();
        }
      }
    }

    async function persist() {
      if (busy || !loaded || !isDirty() || !isCurrent() || !panel.isConnected) return;
      busy = true;
      setStatus("저장 중…", "busy");
      refreshControls();
      const settings = { version: 1, tools: toolsPayload(draft.tools), rules: draft.rules.map(({ id, kind, effect, match }) => ({ id, kind, effect, match })) };
      let succeeded = false;
      try {
        const result = await save(settings, saved.revision);
        if (!isCurrent() || !panel.isConnected) return;
        if (!result?.ok || !result.settings) {
          // 초안은 유지한다. 충돌 시에는 사용자가 명시적으로 다시 불러온다.
          setStatus(result?.error || "저장하지 못했습니다. 초안은 유지됩니다.", "error");
          return;
        }
        saved = { settings: result.settings, capabilities: result.capabilities || saved.capabilities, revision: result.revision };
        draft = clone(result.settings);
        succeeded = true;
        setStatus("저장됨 · 다음 실행부터 적용됩니다.", "saved");
      } catch {
        if (isCurrent() && panel.isConnected) setStatus("저장하지 못했습니다. 초안은 유지됩니다.", "error");
      } finally {
        busy = false;
        if (panel.isConnected) {
          if (succeeded) renderAll();
          else refreshControls();
        }
      }
    }

    panel.addEventListener("toggle", () => { if (panel.open && !loaded) update(); });
    reloadButton.addEventListener("click", () => {
      if (busy) return;
      if (isDirty() && !window.confirm("저장하지 않은 변경을 버리고 저장된 설정을 다시 불러올까요?")) return;
      update();
    });
    saveButton.addEventListener("click", persist);
    addButton.addEventListener("click", addRule);
    kindSelect.addEventListener("change", refreshControls);
    matchInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      addRule();
    });
    setStatus("열면 현재 설정을 불러옵니다.", "");
    return panel;
  },
};

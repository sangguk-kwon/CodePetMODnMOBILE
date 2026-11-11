// Real renderer/preload/IPC with an isolated mock runner. Native CLIs are tested separately.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");
const { app, BrowserWindow } = electron;
const output = path.resolve("artifacts", "chat-call-approval-smoke", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration(); app.on("window-all-closed", () => {});
const providerId = process.env.CODEPET_SMOKE_PROVIDER || "codex";
if (!["claude", "codex"].includes(providerId)) throw new Error("Unknown fixture provider");
const record = { id: providerId, name: providerId, aliases: [providerId], status: "cli", version: "fixture", commandPath: "fixture",
  catalogStatus: "ready", modelOptions: [{ id: "fixture", efforts: [] }],
  permissions: Object.fromEntries(["chat", "workspace-write"].map(mode => [mode, { supported: true, enforcement: providerId === "claude" ? "tool-policy" : "sandbox" }])) };
require("../src/providers/provider-capabilities").createCapabilityService = () => ({ defs: [record], getRecord: id => id === providerId ? record : null, discover: async () => [record] });
let runs = 0;
const adapter = require(providerId === "claude" ? "../src/chat/claude-approval-runner" : "../src/chat/codex-approval-runner");
adapter[providerId === "claude" ? "runClaudeApprovalTurn" : "runCodexApprovalTurn"] = input => {
  runs++;
  const controller = new AbortController();
  input.parseLine(JSON.stringify(providerId === "claude" ? { type: "system", subtype: "init", session_id: "11111111-2222-4333-8444-555555555555" }
    : { type: "thread.started", thread_id: "11111111-2222-4333-8444-555555555555" }));
  const toolId = `tool-${runs}`;
  const reportText = text => input.parseLine(JSON.stringify(providerId === "claude"
    ? { type: "assistant", message: { id: `message-${runs}-${text}`, content: [{ type: "text", text }] } }
    : { type: "item.completed", item: { type: "agent_message", id: `message-${runs}-${text}`, phase: "commentary", text } }));
  reportText("Checking the related files.");
  input.parseLine(JSON.stringify(providerId === "claude" ? { type: "assistant", message: { content: [{ type: "tool_use", id: toolId, name: "Read", input: { file_path: "SECRET_PROGRESS_PATH" } }] } }
    : { type: "item.started", item: { type: "command_execution", id: toolId, command: "npm test" } }));
  return { promise: input.requestApproval({ summary: "명령 실행 승인", detail: "echo fixture", signal: controller.signal,
    target: { kind: "command", command: "echo fixture", cwd: input.cwd } }).then(approved => {
      if (controller.signal.aborted) return { ok: false, cancelled: true };
      input.parseLine(JSON.stringify(providerId === "claude" ? { type: "user", message: { content: [{ type: "tool_result", tool_use_id: toolId, is_error: !approved, content: "SECRET_PROGRESS_OUTPUT" }] } }
        : { type: "item.completed", item: { type: "command_execution", id: toolId, command: "npm test", exit_code: approved ? 0 : 1, aggregated_output: "SECRET_PROGRESS_OUTPUT" } }));
      reportText("The tool finished; preparing the result.");
      input.parseLine(JSON.stringify(providerId === "claude"
        ? { type: "assistant", message: { id: `final-${runs}`, content: [{ type: "text", text: approved ? "Allowed fixture" : "Denied fixture" }] } }
        : { type: "item.completed", item: { id: `final-${runs}`, type: "agent_message", phase: "final_answer", text: approved ? "Allowed fixture" : "Denied fixture" } }));
      return { ok: true, text: approved ? "Allowed fixture" : "Denied fixture" };
    }),
  cancel: () => controller.abort() };
};
const { createChatFeature } = require("../src/chat/chat-ipc");
const { ChatStore } = require("../src/chat/chat-store");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i = 0; i < 150; i++) { if (await check()) return; await pause(25); } throw new Error("Approval UI timed out"); }
async function main() {
  const store = new ChatStore({ root: path.join(output, "store") }).init();
  const session = store.createSession({});
  store.updateMeta(session.id, { workspace: output, permissionMode: "workspace-write" });
  class HiddenWindow extends BrowserWindow {
    constructor(options) { super({ ...options, webPreferences: { ...options.webPreferences, backgroundThrottling: false, offscreen: true } }); }
    show() {} focus() {}
  }
  const feature = createChatFeature({ store, platform: "linux", env: { CODEX_HOME: path.join(output, "source"), CLAUDE_CONFIG_DIR: path.join(output, "claude-source") },
    electron: { ...electron, BrowserWindow: HiddenWindow } });
  feature.registerIpcHandlers();
  const win = feature.openWindow(), js = source => win.webContents.executeJavaScript(source);
  const errors = [];
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    await until(() => js("typeof activeSessionId === 'string' && agents.length === 1").catch(() => false));
    await js("localStorage.setItem(DOCTOR_SEEN_KEY, 'true'); doctorBackdrop.hidden = true");
    const send = async () => { await js(`window.chatApi.send(activeSessionId, '@${providerId} fixture', [])`); await until(() => js("!approvalBackdrop.hidden")); };
    await send();
    assert.equal(await js("document.querySelectorAll('.is-commentary').length"), 1);
    assert.equal(await js("Array.from(document.querySelectorAll('.progress-history')).some(e=>e.open)"), false);
    assert.match(await js("Array.from(document.querySelectorAll('.is-live .live-status')).at(-1).textContent"), /대기|작업/);
    assert.equal(await js("approvalApprove.textContent"), "이번 요청 허용");
    assert.match(await js("document.querySelector('.approval-warning').textContent"), /같은 실행/);
    await pause(150);
    assert.equal(await js("approvalBackdrop.hidden"), false);
    assert.equal(await js("getComputedStyle(approvalBackdrop).display"), "grid");
    fs.writeFileSync(path.join(output, "approval.png"), (await win.webContents.capturePage()).toPNG());
    await js("approvalApprove.click(); approvalApprove.click()");
    await until(() => js("messageList.textContent.includes('Allowed fixture')"));
    assert.equal(runs, 1);
    assert.equal(await js("document.querySelectorAll('.is-commentary').length"), 2);
    assert.equal(await js("Array.from(document.querySelectorAll('.message:not(.is-commentary)')).filter(e=>e.textContent.includes('Allowed fixture')).length"), 1);
    await pause(180);
    fs.writeFileSync(path.join(output, "sequential-messages.png"), (await win.webContents.capturePage()).toPNG());
    await send(); await js("approvalDeny.click()");
    await until(() => js("messageList.textContent.includes('Denied fixture')"));
    assert.equal(runs, 2);
    await send();
    const firstSessionId = session.id;
    await js("(async () => applyFullState(await window.chatApi.sessionsCreate()))()");
    assert.equal(await js("approvalBackdrop.hidden"), true, "another session must not display the previous call");
    await js(`(async () => applyFullState(await window.chatApi.sessionsSelect(${JSON.stringify(firstSessionId)})))()`);
    await until(() => js("!approvalBackdrop.hidden"));
    win.webContents.reload();
    await until(() => js("typeof approvalBackdrop !== 'undefined' && !approvalBackdrop.hidden").catch(() => false));
    await js("doctorBackdrop.hidden = true; approvalApprove.click()");
    await until(() => js("approvalBackdrop.hidden"));
    assert.equal(runs, 3, "reload must not restart the pending turn");
    await until(() => js("!turnState.current"));
    await send();
    await js("window.chatApi.stop(activeSessionId)");
    await until(() => js("approvalBackdrop.hidden"));
    assert.equal(runs, 4);
    await until(() => js("!turnState.current"));
    await send();
    assert.equal(await js("document.getElementById('approval-more').hidden"), false);
    await js("document.getElementById('approval-more').open=true");
    await pause(180);
    fs.writeFileSync(path.join(output, "conversation-menu.png"), (await win.webContents.capturePage()).toPNG());
    store.readOnly = true;
    await js("document.getElementById('approval-conversation').click()");
    await until(() => js("!approvalBackdrop.hidden && !approvalApprove.disabled"));
    assert.equal(runs, 5, "failed grant save must not replay or finish the request");
    store.readOnly = false;
    await js("document.getElementById('approval-more').open=true");
    await js("document.getElementById('approval-conversation').click()");
    await until(() => js("!turnState.current && approvalBackdrop.hidden"));
    const saved = await js(`window.chatApi.conversationGrants(activeSessionId,'${providerId}')`);
    assert.equal(saved.grants.length, 1);
    await js(`window.chatApi.send(activeSessionId,'@${providerId} repeat',[])`);
    await until(async () => (await js("!turnState.current && approvalBackdrop.hidden && liveRuns.size===0")) && runs === 6);
    assert.equal(runs, 6);
    assert.equal(await js("messageList.textContent.includes('SECRET_PROGRESS')"), false);
    assert.ok(await js("document.querySelectorAll('.is-commentary').length > 0"), "reports persist after renderer reload");
    assert.ok(await js("document.querySelectorAll('.progress-history').length > 0"));
    await js("Array.from(document.querySelectorAll('.progress-history')).at(-1).open=true");
    assert.match(await js("Array.from(document.querySelectorAll('.progress-history')).at(-1).textContent"), /완료/);
    await pause(180);
    fs.writeFileSync(path.join(output, "progress.png"), (await win.webContents.capturePage()).toPNG());
    await js(`document.querySelector('.agent-chip[data-agent-id="${providerId}"]').click(); document.querySelector('.conversation-grants').open=true`);
    await until(() => js("!!document.querySelector('.conversation-grant button')"));
    await js("document.querySelector('.conversation-grant button').click()");
    await until(() => js("document.querySelector('.conversation-grants').textContent.includes('저장된 허용 없음')"));
    await js("closePopover()");
    await send(); await js("approvalDeny.click()");
    await until(() => js("!turnState.current"));
    win.webContents.reload();
    await until(() => js("typeof activeSessionId === 'string' && document.querySelectorAll('.progress-history').length > 0").catch(() => false));
    assert.equal(await js("messageList.textContent.includes('SECRET_PROGRESS')"), false);
    assert.deepEqual(errors, []);
    console.log(`PASS ${providerId} call approval UI allow/deny/double-click/reload/cancel; screenshot: ${output}`);
  } finally { win.destroy(); await feature.shutdown(); store.close(); }
}
const timer = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(main).then(() => { clearTimeout(timer); app.exit(0); }).catch(error => {
  fs.writeFileSync(path.join(output, "error.txt"), error.stack); console.error(error); app.exit(1);
});

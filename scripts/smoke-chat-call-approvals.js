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
  return { promise: input.requestApproval({ summary: "명령 실행 승인", detail: "echo fixture", signal: controller.signal }).then(approved =>
    controller.signal.aborted ? { ok: false, cancelled: true } : { ok: true, text: approved ? "Allowed fixture" : "Denied fixture" }),
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
    assert.equal(await js("approvalApprove.textContent"), "이번 요청 허용");
    assert.match(await js("document.querySelector('.approval-warning').textContent"), /같은 실행/);
    await pause(150);
    assert.equal(await js("approvalBackdrop.hidden"), false);
    assert.equal(await js("getComputedStyle(approvalBackdrop).display"), "grid");
    fs.writeFileSync(path.join(output, "approval.png"), (await win.webContents.capturePage()).toPNG());
    await js("approvalApprove.click(); approvalApprove.click()");
    await until(() => js("messageList.textContent.includes('Allowed fixture')"));
    assert.equal(runs, 1);
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
    assert.deepEqual(errors, []);
    console.log(`PASS ${providerId} call approval UI allow/deny/double-click/reload/cancel; screenshot: ${output}`);
  } finally { win.destroy(); await feature.shutdown(); store.close(); }
}
const timer = setTimeout(() => app.exit(1), 30000);
app.whenReady().then(main).then(() => { clearTimeout(timer); app.exit(0); }).catch(error => {
  fs.writeFileSync(path.join(output, "error.txt"), error.stack); console.error(error); app.exit(1);
});

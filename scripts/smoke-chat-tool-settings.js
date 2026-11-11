// Real Electron renderer/preload/IPC, isolated store and mock provider execution.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const electron = require("electron");
const { app, BrowserWindow } = electron;
const output = path.resolve("artifacts", "chat-tool-settings-smoke", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", path.join(output, "profile"));
app.disableHardwareAcceleration(); app.on("window-all-closed", () => {});
const records = ["claude", "codex"].map(id => ({ id, name: id, aliases: [id], status: "cli", version: "fixture", commandPath: "fixture",
  catalogStatus: "ready", modelOptions: [{ id: "fixture", efforts: [] }],
  permissions: Object.fromEntries(["chat", "workspace-read", "workspace-write"].map(mode => [mode, { supported: true, enforcement: "fixture" }])) }));
require("../src/providers/provider-capabilities").createCapabilityService = () => ({ defs: records,
  getRecord: id => records.find(record => record.id === id), discover: async () => records });
let runs = 0, waiting = 0;
require("../src/chat/codex-approval-runner").runCodexApprovalTurn = input => {
  runs++;
  const controller = new AbortController();
  input.parseLine(JSON.stringify({ type: "thread.started", thread_id: "11111111-2222-4333-8444-555555555555" }));
  if (input.autoApprove) return { promise: Promise.resolve({ ok: true, text: "Restricted automatic fixture",
    appliedPermissions: { approval: "never", sandbox: "workspaceWrite", verifiedAt: Date.now() } }), cancel() {} };
  return { promise: input.requestApproval({ summary: "명령 실행 승인", detail: "echo fixture", signal: controller.signal,
    target: { kind: "command", command: "echo fixture", cwd: input.cwd } }).then(approved =>
    controller.signal.aborted ? { ok: false, cancelled: true } : { ok: true, text: approved ? "Rule allowed fixture" : "Rule denied fixture" }),
  cancel: () => controller.abort() };
};
const { createChatFeature } = require("../src/chat/chat-ipc");
const { ChatStore } = require("../src/chat/chat-store");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i = 0; i < 200; i++) { if (await check()) return; await pause(25); } throw new Error("Tool settings UI timed out"); }
async function main() {
  const store = new ChatStore({ root: path.join(output, "store") }).init();
  const session = store.createSession({});
  store.updateMeta(session.id, { workspace: output, permissionMode: "workspace-write" });
  class HiddenWindow extends BrowserWindow {
    constructor(options) { super({ ...options, webPreferences: { ...options.webPreferences, backgroundThrottling: false, offscreen: true } }); }
    show() {} focus() {}
  }
  const feature = createChatFeature({ store, platform: "linux", env: { CODEX_HOME: path.join(output, "source"), CLAUDE_CONFIG_DIR: path.join(output, "claude-source") },
    onChatNotification: event => { if (event.kind === "waiting") waiting++; }, electron: { ...electron, BrowserWindow: HiddenWindow } });
  feature.registerIpcHandlers();
  const win = feature.openWindow(), js = source => win.webContents.executeJavaScript(source);
  const errors = [];
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  const q = ".tool-settings";
  const open = async id => {
    await js(`document.querySelector('.agent-chip[data-agent-id="${id}"]').click(); document.querySelector('${q}').open=true`);
    await until(() => js(`document.querySelector('${q} .tool-settings-form')?.disabled === false`));
  };
  const clickSave = async () => {
    await js(`document.querySelector('${q} .button-primary').click(); document.querySelector('${q} .button-primary').click()`);
    await until(() => js(`document.querySelector('${q} .tool-settings-status').dataset.tone === 'saved'`));
  };
  const add = async (effect, match) => js(`(() => {
    document.querySelector('${q} select[aria-label="규칙 동작"]').value=${JSON.stringify(effect)};
    document.querySelector('${q} input[aria-label="일치시킬 명령 또는 파일 경로"]').value=${JSON.stringify(match)};
    document.querySelector('${q} .tool-settings-add .button').click();
  })()`);
  try {
    await until(() => js("typeof activeSessionId === 'string' && agents.length === 2").catch(() => false));
    await js("localStorage.setItem(DOCTOR_SEEN_KEY, 'true'); doctorBackdrop.hidden=true; window.confirm=()=>true; true");
    await open("codex");
    const environment = 'select[aria-label="Codex 실행 환경"]';
    const automatic = "Array.from(document.querySelectorAll('.popover-field')).find(node=>node.firstChild.textContent==='도구 자동 승인').querySelector('input')";
    assert.equal(await js(`document.querySelector('${environment}').value`), "workspace-write");
    assert.equal(await js(`document.querySelector('${environment}').options[1].disabled`), true);
    await js(`window.confirm=()=>false; ${automatic}.click()`);
    assert.ok(!store.readMeta(session.id).agents?.codex?.autoApprove);
    await js(`window.confirm=()=>true; ${automatic}.click()`);
    await until(() => store.readMeta(session.id).agents?.codex?.autoApprove === true);
    await until(() => js("popover.hidden"));
    await open("codex");
    assert.equal(store.readMeta(session.id).agents.codex.codexSandbox, "workspace-write");
    await js("closePopover(); window.chatApi.send(activeSessionId,'@codex automatic fixture',[])");
    await until(() => js("!turnState.current && messageList.textContent.includes('Restricted automatic fixture')"));
    assert.equal(runs, 1); assert.equal(waiting, 0); runs=0;
    await open("codex");
    await js(`window.confirm=()=>false; document.querySelector('${environment}').value='danger-full-access'; document.querySelector('${environment}').dispatchEvent(new Event('change'))`);
    assert.equal(await js(`document.querySelector('${environment}').value`), "workspace-write");
    store.readOnly=true;
    await js(`window.confirm=()=>true; document.querySelector('${environment}').value='danger-full-access'; document.querySelector('${environment}').dispatchEvent(new Event('change'))`);
    await until(() => js(`!document.querySelector('${environment}').disabled`));
    assert.equal(await js(`document.querySelector('${environment}').value`), "workspace-write", "rejected environment changes roll back");
    store.readOnly=false;
    // Loading legacy settings must preserve the old checkbox's full-access meaning.
    const meta=store.readMeta(session.id); delete meta.agents.codex.codexSandbox;
    store.updateMeta(session.id,{agents:meta.agents});
    win.webContents.reload();
    await until(() => js("typeof activeSessionId === 'string' && agents.length === 2").catch(() => false));
    await js("doctorBackdrop.hidden=true; window.confirm=()=>true; true");
    await open("codex");
    assert.equal(await js(`document.querySelector('${environment}').value`), "danger-full-access");
    assert.equal(store.readMeta(session.id).agents.codex.codexSandbox, undefined);
    await js(`document.querySelector('${environment}').value='workspace-write'; document.querySelector('${environment}').dispatchEvent(new Event('change'))`);
    await until(() => store.readMeta(session.id).agents.codex.codexSandbox === "workspace-write");
    await until(() => js("popover.hidden"));
    win.webContents.reload();
    await until(() => js("typeof activeSessionId === 'string' && agents.length === 2").catch(() => false));
    await js("doctorBackdrop.hidden=true; window.confirm=()=>true; true");
    await open("codex");
    assert.equal(await js(`document.querySelector('${environment}').value`), "workspace-write");
    fs.writeFileSync(path.join(output,"execution.png"),(await win.webContents.capturePage()).toPNG());
    await js(`${automatic}.click()`);
    await until(() => store.readMeta(session.id).agents.codex.autoApprove === false);
    await until(() => js("popover.hidden"));
    await open("codex");
    assert.equal(await js(`Array.from(document.querySelectorAll('${q} .tool-settings-tools input')).every(node=>node.disabled)`), true);
    await add("allow", "echo fixture");
    await js(`window.alert=()=>{}; ${automatic}.click()`);
    assert.equal(await js(`${automatic}.checked`), false, "unsaved rules must survive approval setting changes");
    assert.equal(await js(`document.querySelectorAll('${q} .tool-settings-rule').length`), 1);
    await clickSave();
    assert.equal((await js("window.chatApi.toolSettings(activeSessionId,'codex')")).settings.rules.length, 1);

    // Rejected backend changes must not leave a visually enabled bypass checkbox.
    await js("Array.from(document.querySelectorAll('.popover-field')).find(node=>node.firstChild.textContent==='도구 자동 승인').querySelector('input').click()");
    await until(() => js("Array.from(document.querySelectorAll('.popover-field')).find(node=>node.firstChild.textContent==='도구 자동 승인').querySelector('input').disabled === false"));
    assert.equal(await js("Array.from(document.querySelectorAll('.popover-field')).find(node=>node.firstChild.textContent==='도구 자동 승인').querySelector('input').checked"), false);
    assert.ok(!store.readMeta(session.id).agents?.codex?.autoApprove);

    await add("allow", "curl -H 'Authorization: Bearer secret-fixture' https://example.invalid");
    await js(`document.querySelector('${q} .button-primary').click()`);
    await until(() => js(`document.querySelector('${q} .tool-settings-status').dataset.tone === 'error'`));
    assert.equal(await js(`document.querySelectorAll('${q} .tool-settings-rule').length`), 2, "failed save keeps draft");
    await js(`Array.from(document.querySelectorAll('${q} .tool-settings-remove')).at(-1).click()`);
    await js("popover.scrollTop=popover.scrollHeight"); await pause(100);
    assert.equal(await js("popover.getBoundingClientRect().bottom <= window.innerHeight + 1"), true, "expanded panel must fit viewport");
    fs.writeFileSync(path.join(output, "codex.png"), (await win.webContents.capturePage()).toPNG());

    await js("closePopover(); window.chatApi.send(activeSessionId,'@codex fixture',[])");
    await until(() => js("!turnState.current && messageList.textContent.includes('Rule allowed fixture')"));
    assert.equal(runs, 1); assert.equal(waiting, 0);
    await open("codex");
    await js(`document.querySelector('${q} .tool-settings-remove').click()`);
    await add("deny", "echo fixture"); await clickSave();
    await js("closePopover(); window.chatApi.send(activeSessionId,'@codex fixture',[])");
    await until(() => js("!turnState.current && messageList.textContent.includes('Rule denied fixture')"));
    assert.equal(runs, 2); assert.equal(waiting, 0);

    win.webContents.reload();
    await until(() => js("typeof activeSessionId === 'string' && agents.length === 2").catch(() => false));
    await js("doctorBackdrop.hidden=true; window.confirm=()=>true; true");
    await open("codex");
    assert.match(await js(`document.querySelector('${q} .tool-settings-rule-meta').textContent`), /거부/);
    await open("claude");
    assert.equal(await js(`document.querySelector('${q} .tool-settings-add .button').disabled`), false);
    assert.equal(await js(`document.querySelectorAll('${q} .tool-settings-tools input:disabled').length`), 0);
    await add("allow", "echo Claude fixture"); await clickSave();
    assert.equal((await js("window.chatApi.toolSettings(activeSessionId,'claude')")).settings.rules[0].match, "echo Claude fixture");
    await js(`Array.from(document.querySelectorAll('${q} .tool-settings-tool')).find(node=>node.textContent.includes('(Bash)')).querySelector('input').click()`);
    await clickSave();
    assert.equal((await js("window.chatApi.toolSettings(activeSessionId,'claude')")).settings.tools.Bash, false);
    await js("popover.scrollTop=popover.scrollHeight"); await pause(100);
    fs.writeFileSync(path.join(output, "claude.png"), (await win.webContents.capturePage()).toPNG());

    // Detached panels must not apply an old async response after session switch.
    await js(`(() => { let finish, current=true;
      const panel=chatToolSettings.createPanel({load:()=>new Promise(resolve=>{finish=resolve}),save:async()=>{},isCurrent:()=>current});
      window.stalePanel=panel;
      document.body.append(panel); panel.open=true;
      setTimeout(()=>{current=false;panel.remove();finish({ok:true,settings:{version:1,tools:{},rules:[]},capabilities:{tools:[],rules:{},notes:[]},revision:'old'});},20);
    })()`);
    await pause(75);
    assert.equal(await js("window.stalePanel.querySelector('.tool-settings-form').disabled"), true);
    await js(`(() => { window.staleSaves=0;window.staleCurrent=true;
      window.stalePanel=chatToolSettings.createPanel({load:async()=>({ok:true,settings:{version:1,tools:{},rules:[]},
        capabilities:{tools:[{id:'Bash',supported:true}],rules:{},notes:[]},revision:'old'}),
        save:async()=>{window.staleSaves++;return {ok:false};},isCurrent:()=>window.staleCurrent});
      document.body.append(window.stalePanel);window.stalePanel.open=true;
    })()`);
    await until(()=>js("window.stalePanel.querySelector('.tool-settings-form').disabled === false"));
    await js("window.stalePanel.querySelector('.tool-settings-tools input').click();window.staleCurrent=false;window.stalePanel.querySelector('.button-primary').click()");
    await pause(50);
    assert.equal(await js("window.staleSaves"), 0, "a stale panel must not send a save request");
    await js("window.stalePanel.remove();(async()=>applyFullState(await window.chatApi.sessionsCreate()))()");
    assert.equal(await js("popover.hidden"), true, "session switch closes the previous participant settings");
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ ok: true, mockProvider: true, realElectronIpc: true,
      checks: ["scope capabilities", "allow/deny live request", "double save", "secret rejection/draft", "bypass rejection rollback", "viewport", "reload persistence", "Claude tools", "stale response"], runs, waiting }, null, 2));
    console.log(`PASS common tool settings UI; screenshots: ${output}`);
  } finally { win.destroy(); await feature.shutdown(); store.close(); }
}
const timer = setTimeout(() => app.exit(1), 45000);
app.whenReady().then(main).then(() => { clearTimeout(timer); app.exit(0); }).catch(error => {
  fs.writeFileSync(path.join(output, "error.txt"), error.stack); console.error(error); app.exit(1);
});

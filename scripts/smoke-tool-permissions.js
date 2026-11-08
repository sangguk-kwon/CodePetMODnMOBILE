// Opt-in real Electron renderer + IPC, isolated synthetic settings and no model calls.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const output = path.join(__dirname, "..", "artifacts", "tool-permission-smoke", String(Date.now()));
fs.mkdirSync(output, { recursive: true });
app.setPath("userData", path.join(output, "electron-profile"));
app.disableHardwareAcceleration();
app.on("window-all-closed", () => {});
const providers = ["codex", "claude"].map(id => ({ id, name: id, aliases: [id], status: "cli", version: "fixture-1.0",
  catalogStatus: "ready", authStatus: "unknown", models: ["fixture-model"], modelOptions: [{ id: "fixture-model", efforts: [] }],
  permissions: Object.fromEntries(["chat", "workspace-read", "workspace-write"].map(mode => [mode, { supported: true }])) }));
require("../src/providers/provider-capabilities").createCapabilityService = () => ({ defs: providers,
  getRecord: id => providers.find(provider => provider.id === id), discover: async () => providers });
const { createChatFeature } = require("../src/chat/chat-ipc");
const { ChatStore } = require("../src/chat/chat-store");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 100; i++) { if (await check()) return; await pause(30); }
  throw new Error("Permission UI condition timed out");
}

async function main() {
  const home = path.join(output, "claude-settings");
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, "settings.json"), JSON.stringify({ env: { TOKEN: "secret-smoke-token" },
    permissions: { allow: ["Bash(secret-command)", "Read"], deny: ["WebFetch"] } }));
  const store = new ChatStore({ root: path.join(output, "store") }).init();
  const session = store.createSession({});
  store.updateMeta(session.id, { workspace: output, permissionMode: "workspace-write",
    agents: { codex: { autoApprove: true }, claude: { autoApprove: false } } });
  const feature = createChatFeature({ store, env: { CODEX_HOME: path.join(output, "codex-settings"), CLAUDE_CONFIG_DIR: home },
    electron: require("electron") });
  feature.registerIpcHandlers();
  const win = new BrowserWindow({ show: false, width: 900, height: 750, frame: false,
    webPreferences: { preload: path.join(__dirname, "..", "src", "chat-preload.js"),
      backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  const js = source => win.webContents.executeJavaScript(source);
  const errors = [];
  win.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
  try {
    await win.loadFile(path.join(__dirname, "..", "src", "chat.html"));
    await until(() => js("agents.length === 2"));
    for (const id of ["codex", "claude"]) {
      await js(`openAgentPopover(agentChips.firstElementChild, ${JSON.stringify(id)}); document.querySelector('.permission-diagnostics').open = true`);
      await until(() => js("document.querySelector('.permission-diagnostics-content').textContent.includes('CLI:')"));
      const text = await js("document.querySelector('.permission-diagnostics').textContent");
      assert.ok(!text.includes("secret-smoke-token") && !text.includes("secret-command"));
      assert.match(text, id === "codex" ? /샌드박스: 해제/ : /파일 편집 자동 허용/);
      if (id === "claude") assert.match(text, /허용 규칙 2개/);
      await js("document.querySelector('.permission-diagnostics button').click()");
      await until(() => js("!document.querySelector('.permission-diagnostics button').disabled"));
      for (const width of [900, 560]) {
        win.setSize(width, 750);
        await pause(50);
        assert.equal(await js("document.querySelector('.permission-diagnostics').scrollWidth > document.querySelector('.permission-diagnostics').clientWidth"), false);
      }
      win.setSize(900, 750);
      await pause(50);
      fs.writeFileSync(path.join(output, `${id}.png`), (await win.webContents.capturePage()).toPNG());
      await js("closePopover()");
    }
    // Delayed results from a previous session must not render into its old panel.
    assert.equal(await js(`(async () => {
      let resolve; let current = true;
      const panel = chatPermissions.createPanel({ load: () => new Promise(done => { resolve = done; }), isCurrent: () => current });
      document.body.append(panel); panel.open = true;
      await new Promise(done => setTimeout(done, 50)); current = false;
      resolve({ok:true, diagnostics:{version:'STALE_RESULT'}});
      await new Promise(done => setTimeout(done, 50));
      const stale = panel.textContent.includes('STALE_RESULT'); panel.remove(); return stale;
    })()`), false);
    assert.deepEqual(errors, []);
    console.log(`PASS real permission panels, refresh, source counts, redaction, stale result guard; screenshots: ${output}`);
  } finally {
    win.destroy();
    await feature.shutdown();
    store.close();
  }
}

const deadline = setTimeout(() => {
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ ok: false, error: "Smoke timed out" }));
  app.exit(1);
}, 30000);
app.whenReady().then(main).then(() => {
  clearTimeout(deadline);
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ ok: true }));
  app.exit(0);
}).catch(error => {
  clearTimeout(deadline);
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify({ ok: false, error: error.stack }));
  console.error(error);
  app.exit(1);
});

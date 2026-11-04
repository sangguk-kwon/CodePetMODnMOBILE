const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createChatFeature } = require("../src/chat/chat-ipc");

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

test("채팅 제목 표시줄의 설정 버튼이 안전한 preload API에 연결된다", () => {
  const html = source("src/chat.html");
  const css = source("src/chat.css");
  const preload = source("src/chat-preload.js");
  const renderer = source("src/chat.js");

  assert.match(html, /id="btn-settings"[^>]*aria-label="설정 열기"[^>]*title="설정"/);
  assert.match(css, /\.titlebar-btn\.btn-settings\s*\{[^}]*width:\s*40px[^}]*border-right:/s);
  assert.match(preload, /openSettings: \(\) => ipcRenderer\.send\("chat:open-settings"\)/);
  assert.match(
    renderer,
    /getElementById\("btn-settings"\)\.addEventListener\("click", \(\) => window\.chatApi\.openSettings\(\)\)/
  );
});

test("채팅 설정 IPC는 본체의 기존 설정창 열기 콜백만 호출한다", () => {
  const listeners = new Map();
  let openCount = 0;
  const feature = createChatFeature({
    electron: {
      ipcMain: {
        handle() {},
        on(channel, handler) {
          listeners.set(channel, handler);
        },
      },
      dialog: {},
      BrowserWindow: class {},
      shell: {},
    },
    openSettings: () => {
      openCount += 1;
    },
  });

  feature.registerIpcHandlers();
  assert.equal(typeof listeners.get("chat:open-settings"), "function");
  listeners.get("chat:open-settings")();
  assert.equal(openCount, 1);
  assert.match(source("src/main.js"), /openSettings: \(\) => openSettingsWindow\(\)/);
});

test("모델·추론 변경 시점을 안내하고 메시지는 실제 적용 값을 우선 표시한다", () => {
  const renderer = source("src/chat.js");

  assert.match(renderer, /변경은 다음 턴부터 적용됩니다\. 진행 중인 응답은 기존 설정을 유지합니다\./);
  assert.match(renderer, /modelLabel\(saved\.appliedModel \|\| saved\.model \|\| agent\?\.model\)/);
  assert.match(renderer, /effortLabel\(saved\.appliedEffort \|\| saved\.effort \|\|/);
});

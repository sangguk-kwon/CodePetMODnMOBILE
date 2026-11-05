// Builds src/pets/claude/spritesheet.webp from the bundled Claude emoticons.
// Run with Electron: electron scripts/generate-claude-pet.js
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const output = path.join(root, "src", "pets", "claude", "spritesheet.webp");
// Calm and composed: small movements, tea at rest, papers while working.
const ROWS = [
  { pose: "좋은데", frames: 6, motion: "breathe" }, // idle
  { pose: "주인님", frames: 8, motion: "walk" }, // runningRight
  { pose: "주인님", frames: 8, motion: "walk", flip: true }, // runningLeft
  { pose: "파일줘봐", frames: 4, motion: "wave" }, // waving
  { pose: "우헤헤", frames: 5, motion: "hop" }, // jumping
  { pose: "오류났다", frames: 8, motion: "shake" }, // failed
  { pose: "잠깐만", frames: 8, motion: "sway" }, // waiting
  { pose: "검토완료", frames: 8, motion: "write" }, // running
  { pose: "내가볼게", frames: 8, motion: "read" }, // review
];

async function render(win, poses) {
  return win.webContents.executeJavaScript(`(${async function draw(rows, poses) {
    const COLS = 8, CELL_W = 192, CELL_H = 208, SIZE = 256, CAPTION_LIMIT = 80;
    const load = (url) => new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url;
    });
    // Remove the caption: flood from the edges, then keep the largest shape.
    function cutOut(image) {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, SIZE, SIZE);
      const pixels = context.getImageData(0, 0, SIZE, SIZE);
      const data = pixels.data, seen = new Uint8Array(SIZE * SIZE), stack = [];
      // Captions are pure black on white; the gray hair stops this flood below the text.
      const caption = (i) => {
        if (Math.floor(i / SIZE) >= CAPTION_LIMIT) return data[i * 4 + 3] < 40;
        const low = Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        const high = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        return data[i * 4 + 3] < 40 || low > 215 || high < 95;
      };
      for (let i = 0; i < SIZE; i += 1) stack.push(i, SIZE * SIZE - 1 - i, i * SIZE, i * SIZE + SIZE - 1);
      while (stack.length) {
        const i = stack.pop();
        if (seen[i] || !caption(i)) continue;
        seen[i] = 1;
        const x = i % SIZE;
        if (x > 0) stack.push(i - 1);
        if (x < SIZE - 1) stack.push(i + 1);
        if (i >= SIZE) stack.push(i - SIZE);
        if (i < SIZE * SIZE - SIZE) stack.push(i + SIZE);
      }
      const labels = new Int32Array(SIZE * SIZE), sizes = [0];
      for (let start = 0; start < SIZE * SIZE; start += 1) {
        if (seen[start] || labels[start]) continue;
        const label = sizes.length; let count = 0; stack.push(start); labels[start] = label;
        while (stack.length) {
          const i = stack.pop(); count += 1;
          const x = i % SIZE;
          for (const next of [x > 0 ? i - 1 : -1, x < SIZE - 1 ? i + 1 : -1, i - SIZE, i + SIZE]) {
            if (next >= 0 && next < SIZE * SIZE && !seen[next] && !labels[next]) { labels[next] = label; stack.push(next); }
          }
        }
        sizes.push(count);
      }
      const largest = sizes.indexOf(Math.max(...sizes));
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        if (labels[i] !== largest) { data[i * 4 + 3] = 0; continue; }
        const x = i % SIZE, y = Math.floor(i / SIZE);
        const edge = [i - 1, i + 1, i - SIZE, i + SIZE].some((n) => x === 0 || x === SIZE - 1 || y === 0 || labels[n] !== largest);
        if (edge) data[i * 4 + 3] = 150;
        const fade = SIZE - 1 - y;
        if (fade < 12) data[i * 4 + 3] = Math.min(data[i * 4 + 3], Math.round(fade / 12 * 255));
      }
      context.putImageData(pixels, 0, 0);
      return canvas;
    }
    const motions = {
      breathe: (t) => ({ scaleY: 1 + 0.012 * Math.sin(t), y: 0, tilt: 0.6 * Math.sin(t) }),
      walk: (t) => ({ y: -5 * Math.abs(Math.sin(t)), tilt: 2.5 * Math.sin(t) }),
      wave: (t) => ({ tilt: 3.5 * Math.sin(t), y: -2 * Math.abs(Math.sin(t)) }),
      hop: (t) => ({ y: -22 * Math.sin(t / 2), scaleY: 1 + 0.03 * Math.sin(t) }),
      shake: (t, frame) => ({ x: (frame < 5 ? 5 : 1.5) * Math.sin(t * 3), tilt: -1.5 }),
      sway: (t) => ({ tilt: 1.8 * Math.sin(t), x: 1.5 * Math.sin(t) }),
      write: (t) => ({ tilt: 0.8 * Math.sin(t * 2), y: -1.5 * Math.abs(Math.sin(t * 2)) }),
      read: (t) => ({ tilt: 1.2 * Math.sin(t), y: -1.2 * Math.abs(Math.sin(t)) }),
    };
    const sheet = document.createElement("canvas");
    sheet.width = COLS * CELL_W; sheet.height = rows.length * CELL_H;
    const context = sheet.getContext("2d");
    context.imageSmoothingQuality = "high";
    const cutouts = {};
    for (const [name, url] of Object.entries(poses)) cutouts[name] = cutOut(await load(url));
    rows.forEach((row, rowIndex) => {
      for (let frame = 0; frame < row.frames; frame += 1) {
        const t = frame / row.frames * Math.PI * 2;
        const { x = 0, y = 0, tilt = 0, scaleY = 1 } = motions[row.motion](t, frame);
        context.save();
        context.translate((frame + 0.5) * CELL_W + x, (rowIndex + 1) * CELL_H - 4 + y);
        context.rotate(tilt * Math.PI / 180);
        context.scale(row.flip ? -1 : 1, scaleY);
        const size = 188;
        context.drawImage(cutouts[row.pose], -size / 2, -size + 8, size, size);
        context.restore();
      }
    });
    const preview = document.createElement("canvas");
    preview.width = sheet.width / 2; preview.height = sheet.height / 2;
    const previewContext = preview.getContext("2d");
    previewContext.fillStyle = "#39414d"; previewContext.fillRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(sheet, 0, 0, preview.width, preview.height);
    return { webp: sheet.toDataURL("image/webp", 0.92), preview: preview.toDataURL("image/png") };
  }})(${JSON.stringify(ROWS)}, ${JSON.stringify(poses)})`);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const poses = {};
  for (const row of ROWS) {
    const file = path.join(root, "src", "chat-icon", "emoticons", "claude", `${row.pose}.png`);
    poses[row.pose] = `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
  }
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const { webp, preview } = await render(win, poses);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.from(webp.split(",")[1], "base64"));
  if (process.env.CLAUDE_PET_PREVIEW) fs.writeFileSync(process.env.CLAUDE_PET_PREVIEW, Buffer.from(preview.split(",")[1], "base64"));
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });

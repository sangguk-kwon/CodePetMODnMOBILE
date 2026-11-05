// Builds src/pets/claude/spritesheet.webp from build/claude-pet-source.png.
// The source is an 8x11 sheet on pure green, generated from the Claude emoticons.
// Run with Electron: electron scripts/generate-claude-pet.js
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.join(root, "build", "claude-pet-source.png");
const output = path.join(root, "src", "pets", "claude", "spritesheet.webp");

async function render(win, url) {
  return win.webContents.executeJavaScript(`(${async function draw(sourceUrl) {
    const SHEET_W = 1536, SHEET_H = 2288;
    const image = await new Promise((resolve, reject) => {
      const element = new Image(); element.onload = () => resolve(element); element.onerror = reject; element.src = sourceUrl;
    });
    const sheet = document.createElement("canvas");
    sheet.width = SHEET_W; sheet.height = SHEET_H;
    const context = sheet.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, SHEET_W, SHEET_H);
    const pixels = context.getImageData(0, 0, SHEET_W, SHEET_H);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const excess = g - Math.max(r, b);
      if (excess <= 8) continue;
      // Strong green is background; a weak excess is edge spill to neutralize.
      data[i + 3] = Math.round(255 * Math.max(0, 1 - excess / 90));
      data[i + 1] = Math.max(r, b);
    }
    context.putImageData(pixels, 0, 0);
    // The source holds even look directions in row 9 and odd ones in row 10. The app
    // reads 0-7 from row 9 and 8-15 from row 10, so interleave those two rows.
    const CELL_W = 192, CELL_H = 208;
    const looks = document.createElement("canvas");
    looks.width = SHEET_W; looks.height = CELL_H * 2;
    looks.getContext("2d").drawImage(sheet, 0, CELL_H * 9, SHEET_W, CELL_H * 2, 0, 0, SHEET_W, CELL_H * 2);
    context.clearRect(0, CELL_H * 9, SHEET_W, CELL_H * 2);
    for (let direction = 0; direction < 16; direction += 1) {
      const fromX = Math.floor(direction / 2) * CELL_W, fromY = (direction % 2) * CELL_H;
      const toX = (direction % 8) * CELL_W, toY = (9 + Math.floor(direction / 8)) * CELL_H;
      context.drawImage(looks, fromX, fromY, CELL_W, CELL_H, toX, toY, CELL_W, CELL_H);
    }
    const preview = document.createElement("canvas");
    preview.width = SHEET_W / 2; preview.height = SHEET_H / 2;
    const previewContext = preview.getContext("2d");
    previewContext.fillStyle = "#39414d"; previewContext.fillRect(0, 0, preview.width, preview.height);
    previewContext.drawImage(sheet, 0, 0, preview.width, preview.height);
    return { webp: sheet.toDataURL("image/webp", 0.92), preview: preview.toDataURL("image/png") };
  }})(${JSON.stringify(url)})`);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const { webp, preview } = await render(win, `data:image/png;base64,${fs.readFileSync(source).toString("base64")}`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.from(webp.split(",")[1], "base64"));
  if (process.env.CLAUDE_PET_PREVIEW) fs.writeFileSync(process.env.CLAUDE_PET_PREVIEW, Buffer.from(preview.split(",")[1], "base64"));
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });

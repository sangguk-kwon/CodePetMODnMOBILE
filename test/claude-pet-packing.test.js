const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isolateFrame, placeFrame } = require("../scripts/pet-frame-packer");
const { decodePng, encodePng } = require("../scripts/pet-png");

test("PNG packing preserves real alpha without lossy colour changes", () => {
  const image = { width: 2, height: 1, data: Buffer.from([123,45,67,128, 1,2,3,0]) };
  assert.deepEqual(decodePng(encodePng(image)), image);
});

test("a detached strip from the preceding frame cannot survive frame isolation", () => {
  const image = { width: 60, height: 60, data: Buffer.alloc(60 * 60 * 4) };
  function rectangle(left, top, width, height) {
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) image.data.fill(255, (y * 60 + x) * 4, (y * 60 + x + 1) * 4);
  }
  rectangle(15, 16, 30, 40); rectangle(15, 0, 25, 2);
  const frame = isolateFrame(image, 1, 1, 0);
  assert.equal(frame.bounds.top, 16);
  assert.equal(frame.data[(20 * 4) + 3], 0);
  const output = { width: 384, height: 416, data: Buffer.alloc(384 * 416 * 4) };
  placeFrame(output, frame, 0, 0);
  assert.equal(output.data[(2 * 384 + 20) * 4 + 3], 0);
});

test("uneven generated row spacing does not clip the next frame's head", () => {
  const image = { width: 60, height: 120, data: Buffer.alloc(60 * 120 * 4) };
  for (const [top, bottom] of [[5,38], [45,105]]) {
    for (let y = top; y <= bottom; y++) for (let x = 10; x < 50; x++) image.data.fill(255, (y * 60 + x) * 4, (y * 60 + x + 1) * 4);
  }
  const frame = isolateFrame(image, 1, 2, 1);
  assert.equal(frame.bounds.bottom - frame.bounds.top + 1, 61);
});

test("all 73 shipped frames have transparent gutters and all unused cells are empty", () => {
  const image = decodePng(fs.readFileSync(path.join(__dirname, "../src/pets/claude/spritesheet.png")));
  const counts = [6,8,8,4,5,8,6,6,6,8,8];
  let total = 0;
  for (let row = 0; row < 11; row++) for (let col = 0; col < 8; col++) {
    let occupied = 0;
    for (let y = 0; y < 416; y++) for (let x = 0; x < 384; x++) {
      if (!image.data[((row * 416 + y) * image.width + col * 384 + x) * 4 + 3]) continue;
      occupied++;
      assert.ok(x >= 20 && x < 364 && y >= 20 && y < 396, `gutter contaminated: ${row}/${col} at ${x}/${y}`);
    }
    assert.equal(occupied > 0, col < counts[row], `occupancy: ${row}/${col}`);
    if (occupied) total++;
  }
  assert.equal(total, 73);
});

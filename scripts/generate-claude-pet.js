// Rebuild with Node; generated panels retain real alpha, with lossless PNG output.
const fs = require('node:fs');
const path = require('node:path');
const { decodePng, encodePng } = require('./pet-png');
const { isolateFrame, placeFrame } = require('./pet-frame-packer');
const root = path.join(__dirname, '..');
const sheet = { width: 3072, height: 4576, data: Buffer.alloc(3072 * 4576 * 4) };
const panels = [
  { name: 'movement', columns: 4, rows: 6, targets: [[0,[0,1,2,3,4,5]],[1,[6,7,8,9,10,11,12,13]],[2,[14,15,16,17,18,19,20,21]]] },
  { name: 'reactions', columns: 4, rows: 5, targets: [[3,[0,1,2,3]],[4,[4,5,6,7,6]],[5,[8,9,10,11,12,13,14,15]]] },
  { name: 'activity', columns: 4, rows: 5, targets: [[6,[2,3,4,5,6,7]],[7,[8,9,10,11,12,13]]] },
  { name: 'review', columns: 2, rows: 3, targets: [[8,[0,1,2,3,4,5]]] },
  { name: 'gaze', columns: 4, rows: 4, targets: [[9,[0,1,2,3,4,5,6,7]],[10,[8,9,10,11,12,13,14,15]]] },
];
for (const panel of panels) {
  const image = decodePng(fs.readFileSync(path.join(root, 'build', 'claude-pet-hd', `${panel.name}.png`)));
  for (const [row, indices] of panel.targets) for (let col = 0; col < indices.length; col++) {
    placeFrame(sheet, isolateFrame(image, panel.columns, panel.rows, indices[col]), row, col);
  }
}
const output = path.join(root, 'src', 'pets', 'claude', 'spritesheet.png');
fs.writeFileSync(output, encodePng(sheet));
console.log(JSON.stringify({ output, width: sheet.width, height: sheet.height, frames: 73, gutter: 24 }));

// Small build-time PNG codec: 8-bit RGB/RGBA, non-interlaced imagegen sources.
const zlib = require("node:zlib");
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("Expected PNG");
  let width, height, channels; const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12]) throw new Error("Unsupported PNG format");
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === "IDAT") chunks.push(data);
    offset += size + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks)), stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error("Invalid PNG data size");
  const scan = Buffer.alloc(stride * height), rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x, a = x >= channels ? scan[index - channels] : 0;
      const b = y ? scan[index - stride] : 0, c = y && x >= channels ? scan[index - stride - channels] : 0;
      const p = a + b - c, distances = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2] ? a : distances[1] <= distances[2] ? b : c;
      scan[index] = raw[y * (stride + 1) + 1 + x] + [0, a, b, Math.floor((a + b) / 2), paeth][filter];
    }
  }
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = scan[i * channels + c];
    rgba[i * 4 + 3] = channels === 4 ? scan[i * channels + 3] : 255;
  }
  return { width, height, data: rgba };
}
function crc32(data) {
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([size, body, crc]);
}
function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const stride = width * 4, scan = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    scan[y * (stride + 1)] = 1; // PNG Sub filter compresses smooth anime colours.
    for (let x = 0; x < stride; x++) scan[y * (stride + 1) + 1 + x] = data[y * stride + x] - (x >= 4 ? data[y * stride + x - 4] : 0);
  }
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(scan, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
module.exports = { decodePng, encodePng };

const rowCache = new WeakMap();
function rowBoundaries(image, rows) {
  if (rowCache.get(image)?.rows === rows) return rowCache.get(image).bounds;
  const scores = Array.from({ length: image.height }, (_, y) => {
    let count = 0;
    for (let x = 0; x < image.width; x++) if (image.data[(y * image.width + x) * 4 + 3] >= 24) count++;
    return count;
  });
  const bounds = [0];
  for (let row = 1; row < rows; row++) {
    const nominal = row * image.height / rows, radius = image.height / rows * 0.35;
    const start = Math.ceil(nominal - radius), end = Math.floor(nominal + radius);
    const minimum = Math.min(...scores.slice(start, end + 1));
    let best = nominal, distance = Infinity;
    for (let y = start; y <= end; y++) {
      if (scores[y] !== minimum) continue;
      const first = y;
      while (y < end && scores[y + 1] === minimum) y++;
      const middle = Math.round((first + y) / 2);
      if (Math.abs(middle - nominal) < distance) { best = middle; distance = Math.abs(middle - nominal); }
    }
    bounds.push(Math.round(best));
  }
  bounds.push(image.height); rowCache.set(image, { rows, bounds }); return bounds;
}
function isolateFrame(image, columns, rows, index) {
  const boundaries = rowBoundaries(image, rows), row = Math.floor(index / columns);
  const left = Math.round(index % columns * image.width / columns), top = boundaries[row];
  const width = Math.round((index % columns + 1) * image.width / columns) - left;
  const height = boundaries[row + 1] - top;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) image.data.copy(data, y * width * 4, ((top + y) * image.width + left) * 4, ((top + y) * image.width + left + width) * 4);
  const labels = new Int32Array(width * height), components = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || data[start * 4 + 3] < 24) continue;
    const label = components.length + 1, queue = [start]; labels[start] = label;
    const component = { label, count: 0, left: width, top: height, right: 0, bottom: 0 };
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const pixel = queue[cursor], x = pixel % width, y = Math.floor(pixel / width);
      component.count++;
      component.left = Math.min(component.left, x); component.right = Math.max(component.right, x);
      component.top = Math.min(component.top, y); component.bottom = Math.max(component.bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || labels[next] || data[next * 4 + 3] < 24) continue;
        labels[next] = label; queue.push(next);
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.count - a.count);
  const main = components[0];
  if (!main || main.count < width * height * 0.03) throw new Error(`Missing sprite ${index}`);
  if (main.left === 0 || main.right === width - 1 || main.top === 0 || main.bottom === height - 1) throw new Error(`Clipped source sprite ${index}`);
  // Keep nearby substantial props; reject detached strips above/below the body.
  const kept = components.filter(c => c === main || (c.count >= main.count * 0.01 && c.bottom >= main.top && c.top <= main.bottom && c.left <= main.right + width * 0.08 && c.right >= main.left - width * 0.08));
  const allowed = new Set(kept.map(c => c.label));
  const bounds = { left: Math.min(...kept.map(c => c.left)), top: Math.min(...kept.map(c => c.top)), right: Math.max(...kept.map(c => c.right)), bottom: Math.max(...kept.map(c => c.bottom)) };
  for (let i = 0; i < labels.length; i++) if (!allowed.has(labels[i])) data.fill(0, i * 4, i * 4 + 4);
  return { width, height, data, bounds };
}
function placeFrame(sheet, frame, row, column, cellWidth = 384, cellHeight = 416) {
  const b = frame.bounds, sourceWidth = b.right - b.left + 1, sourceHeight = b.bottom - b.top + 1;
  const padding = 24, scale = Math.min((cellWidth - padding * 2) / sourceWidth, (cellHeight - padding * 2) / sourceHeight);
  const width = Math.round(sourceWidth * scale), height = Math.round(sourceHeight * scale);
  const left = column * cellWidth + Math.floor((cellWidth - width) / 2), top = row * cellHeight + cellHeight - padding - height;
  // Premultiplied bilinear interpolation avoids RGB fringes on transparent hair.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = b.left + (x + 0.5) / scale - 0.5, sy = b.top + (y + 0.5) / scale - 0.5;
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    let alpha = 0; const colors = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px = Math.max(0, Math.min(frame.width - 1, x0 + dx)), py = Math.max(0, Math.min(frame.height - 1, y0 + dy));
      const source = (py * frame.width + px) * 4, weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      const a = frame.data[source + 3] / 255 * weight; alpha += a;
      for (let c = 0; c < 3; c++) colors[c] += frame.data[source + c] * a;
    }
    const target = ((top + y) * sheet.width + left + x) * 4;
    for (let c = 0; c < 3; c++) sheet.data[target + c] = alpha ? Math.round(colors[c] / alpha) : 0;
    sheet.data[target + 3] = Math.round(alpha * 255);
  }
}
module.exports = { isolateFrame, placeFrame };

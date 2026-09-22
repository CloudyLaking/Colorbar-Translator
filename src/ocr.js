/* Optional local numeric-label suggestions; never silently applied. */
(function(root){
root.ColorbarOCR = function(imageCanvas, crop) {
const state={loaded:true,crop};
const imageContext=imageCanvas.getContext('2d',{willReadFrequently:true});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const TARGET_W = 20;
const TARGET_H = 26;
const GLYPH_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "."];
let glyphTemplates = null;

function ensureGlyphTemplates() {
  if (glyphTemplates) return glyphTemplates;
  const fonts = ["sans-serif", "Arial", "Helvetica", "Tahoma", "Segoe UI", "DejaVu Sans"];
  const all = [];
  for (const font of fonts) {
    for (const glyph of GLYPH_SET) {
      const binary = renderGlyphTemplate(glyph, font);
      if (binary) all.push({ glyph, font, binary });
    }
  }
  const unique = [];
  for (const candidate of all) {
    const duplicate = unique.some((existing) => (
      existing.glyph === candidate.glyph
      && glyphIoU(existing.binary, candidate.binary) > 0.95
    ));
    if (!duplicate) unique.push(candidate);
  }
  glyphTemplates = unique;
  return glyphTemplates;
}

function renderGlyphTemplate(glyph, fontFamily) {
  const side = 48;
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, side, side);
  context.font = `${Math.round(side * 0.6)}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#000";
  context.fillText(glyph, side / 2, side / 2 + 1);
  return binaryFromImage(context.getImageData(0, 0, side, side).data, side, side);
}

function binaryFromImage(data, width, height, threshold = 150, lightText = false) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      if (alpha > 100 && (lightText ? luminance > threshold : luminance < threshold)) {
        count += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  if (count < 3 || maxX < minX || maxY < minY) return null;
  return normalizeBinary(data, width, height, minX, maxX, minY, maxY, threshold, lightText);
}

function normalizeBinary(data, width, height, minX, maxX, minY, maxY, threshold = 150, lightText = false) {
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  // Contain-scale into the target cell (never wider/taller than the cell) so
  // wide glyphs like a minus sign stay intact instead of overflowing.
  const scale = Math.min(TARGET_H / boxHeight, TARGET_W / boxWidth);
  const targetWidth = Math.max(1, Math.round(boxWidth * scale));
  const targetHeight = Math.max(1, Math.round(boxHeight * scale));
  const out = new Uint8Array(TARGET_W * TARGET_H);
  const offsetX = Math.round((TARGET_W - targetWidth) / 2);
  const offsetY = Math.round((TARGET_H - targetHeight) / 2);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = minY + Math.min(boxHeight - 1, Math.floor(y / scale));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = minX + Math.min(boxWidth - 1, Math.floor(x / scale));
      const offset = (sourceY * width + sourceX) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      if (alpha > 100 && (lightText ? luminance > threshold : luminance < threshold)) {
        out[(offsetY + y) * TARGET_W + offsetX + x] = 1;
      }
    }
  }
  return { data: out };
}

function glyphIoU(left, right, offsetX = 0, offsetY = 0) {
  let intersection = 0;
  let union = 0;
  for (let y = 0; y < TARGET_H; y += 1) {
    for (let x = 0; x < TARGET_W; x += 1) {
      const sourceX = x + offsetX;
      const sourceY = y + offsetY;
      const inside = sourceX >= 0 && sourceX < TARGET_W && sourceY >= 0 && sourceY < TARGET_H;
      const leftValue = inside ? left.data[sourceY * TARGET_W + sourceX] : 0;
      const rightValue = right.data[y * TARGET_W + x];
      if (leftValue && rightValue) intersection += 1;
      if (leftValue || rightValue) union += 1;
    }
  }
  return union ? intersection / union : 0;
}

function matchGlyph(binary) {
  const templates = ensureGlyphTemplates();
  let best = null;
  for (const template of templates) {
    // Allow a one-pixel shift so slightly misaligned glyphs (sub-pixel font
    // rasterisation differences) still match their template.
    let score = 0;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        score = Math.max(score, glyphIoU(binary, template.binary, offsetX, offsetY));
      }
    }
    if (!best || score > best.score) best = { glyph: template.glyph, score };
  }
  return best;
}

function tickTextCandidates() {
  if (!state.loaded || !state.crop) return [];
  const crop = state.crop;
  const search = Math.min(190, Math.max(70, Math.round(Math.max(crop.width, crop.height) * 3.5)));
  const pad = 22;
  const candidates = [];
  // Labels may sit on any side of the bar, so probe all four sides and let the
  // OCR stage pick the side that yields the most valid numbers. This is
  // independent of the crop aspect ratio, which can be misleading.
  const leftW = Math.min(search, crop.x + pad);
  if (crop.x >= 8 || leftW > pad) {
    candidates.push({
      x0: Math.max(0, crop.x - leftW), y0: Math.max(0, crop.y - pad),
      x1: crop.x + pad, y1: Math.min(imageCanvas.height, crop.y + crop.height + pad),
      side: "left",
    });
  }
  const rightW = Math.min(search, imageCanvas.width - crop.x + pad);
  if (crop.x + crop.width + rightW > crop.x + crop.width + 8) {
    candidates.push({
      x0: Math.max(0, crop.x + crop.width - pad), y0: Math.max(0, crop.y - pad),
      x1: Math.min(imageCanvas.width, crop.x + crop.width + rightW), y1: Math.min(imageCanvas.height, crop.y + crop.height + pad),
      side: "right",
    });
  }
  const topH = Math.min(search, crop.y + pad);
  if (crop.y >= 8 || topH > pad) {
    candidates.push({
      x0: Math.max(0, crop.x - pad), y0: Math.max(0, crop.y - topH),
      x1: Math.min(imageCanvas.width, crop.x + crop.width + pad), y1: crop.y + pad,
      side: "top",
    });
  }
  const bottomH = Math.min(search, imageCanvas.height - crop.y + pad);
  if (crop.y + crop.height + bottomH > crop.y + crop.height + 8) {
    candidates.push({
      x0: Math.max(0, crop.x - pad), y0: Math.max(0, crop.y + crop.height - pad),
      x1: Math.min(imageCanvas.width, crop.x + crop.width + pad), y1: Math.min(imageCanvas.height, crop.y + crop.height + bottomH),
      side: "bottom",
    });
  }
  return candidates;
}

function otsuThreshold(data) {
  const histogram = new Uint32Array(256);
  let count = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 100) continue;
    const value = Math.round(data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722);
    histogram[value] += 1; count += 1;
  }
  let total = 0; for (let value = 0; value < 256; value += 1) total += value * histogram[value];
  let backgroundWeight = 0, backgroundSum = 0, best = 150, maximum = -1;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value]; if (!backgroundWeight) continue;
    const foregroundWeight = count - backgroundWeight; if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (total - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > maximum) { maximum = variance; best = value; }
  }
  return clamp(best, 45, 220);
}

function connectedCharacters(data, width, height, threshold, lightText) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    const offset = index * 4;
    const luminance = data[offset] * .2126 + data[offset + 1] * .7152 + data[offset + 2] * .0722;
    mask[index] = data[offset + 3] > 100 && (lightText ? luminance > threshold : luminance < threshold) ? 1 : 0;
  }
  const seen = new Uint8Array(mask.length);
  const characters = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    const queue = [seed];
    seen[seed] = 1;
    let cursor = 0;
    let count = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    while (cursor < queue.length) {
      const index = queue[cursor++];
      const x = index % width;
      const y = Math.floor(index / width);
      count += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && !seen[next]) {
            seen[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (count < 3 || boxWidth < 2 || boxHeight < 2) continue;
    if (boxHeight > height * 0.92) continue;
    // Drop border lines and long tick marks: a glyph is roughly square-ish and
    // never spans half the search strip.
    if (boxWidth > width * 0.5 || boxHeight > height * 0.5) continue;
    characters.push({ minX, minY, boxWidth, boxHeight, count });
  }
  return characters;
}

function segmentTickCharacters(region) {
  const width = region.x1 - region.x0;
  const height = region.y1 - region.y0;
  const data = imageContext.getImageData(region.x0, region.y0, width, height).data;
  const threshold = otsuThreshold(data);
  const attempts = [false, true].map((lightText) => ({
    characters: connectedCharacters(data, width, height, threshold, lightText),
    lightText,
    threshold,
  }));
  attempts.sort((left, right) => {
    const score = (attempt) => attempt.characters.filter((item) => item.boxHeight >= 6 && item.boxHeight <= 80).length;
    return score(right) - score(left);
  });
  return attempts[0];
}

function readTicksFromRegion(region) {
  const segmentation = segmentTickCharacters(region);
  const characters = segmentation.characters;
  const recognized = [];
  for (const character of characters) {
    const data = imageContext.getImageData(
      region.x0 + character.minX,
      region.y0 + character.minY,
      character.boxWidth,
      character.boxHeight,
    ).data;
    const binary = binaryFromImage(data, character.boxWidth, character.boxHeight, segmentation.threshold, segmentation.lightText);
    if (!binary) continue;
    const match = matchGlyph(binary);
    if (match && match.score > 0.43) recognized.push({ ...character, glyph: match.glyph, matchScore: match.score });
  }
  if (!recognized.length) return { ticks: [], side: region.side };
  const vertical = region.side === "left" || region.side === "right";
  // For a vertical colorbar the numbers are stacked one row per tick, so group
  // by vertical position; for a horizontal one they sit side by side, so group
  // by horizontal position. Within a group the glyphs are then read left to
  // right (vertical colorbar) or top to bottom (horizontal colorbar).
  recognized.sort((a, b) => (vertical
    ? (a.minY - b.minY) || (a.minX - b.minX)
    : (a.minX - b.minX) || (a.minY - b.minY)));
  const groups = [];
  let current = null;
  for (const character of recognized) {
    if (!current) {
      current = [character];
      groups.push(current);
      continue;
    }
    const last = current[current.length - 1];
    const gap = vertical
      ? character.minY - (last.minY + last.boxHeight)
      : character.minX - (last.minX + last.boxWidth);
    if (gap <= 10) {
      current.push(character);
    } else {
      current = [character];
      groups.push(current);
    }
  }
  const ticks = [];
  for (const group of groups) {
    group.sort((a, b) => a.minX - b.minX);
    let text = group.map((character) => character.glyph).join("");
    // A minus that is not at the start of a tick is a decimal point, which is
    // too small to be told apart from a minus reliably.
    if (text.includes("-") && !text.startsWith("-")) text = text.replace(/-/g, ".");
    if (!/^-?\d+(\.\d+)?$/.test(text)) continue;
    const value = Number(text);
    if (!Number.isFinite(value)) continue;
    const centerY = group.reduce((sum, character) => sum + character.minY + character.boxHeight / 2, 0) / group.length;
    const centerX = group.reduce((sum, character) => sum + character.minX + character.boxWidth / 2, 0) / group.length;
    const position = vertical
      ? (region.y0 + centerY - state.crop.y) / state.crop.height
      : (region.x0 + centerX - state.crop.x) / state.crop.width;
    const confidence = group.reduce((sum, character) => sum + character.matchScore, 0) / group.length;
    ticks.push({ value, position: clamp(position, 0, 1), text, confidence });
  }
  const seenValues = new Set();
  const uniqueTicks = ticks.filter((tick) => !seenValues.has(tick.value) && seenValues.add(tick.value));
  uniqueTicks.sort((a, b) => a.position - b.position);
  const directions = uniqueTicks.slice(1).map((tick, index) => Math.sign(tick.value - uniqueTicks[index].value)).filter(Boolean);
  const monotonic = directions.length < 2 || directions.every((value) => value === directions[0]);
  const confidence = uniqueTicks.reduce((sum, tick) => sum + tick.confidence, 0) / Math.max(1, uniqueTicks.length);
  return { ticks: uniqueTicks, side: region.side, quality: uniqueTicks.length * 2 + confidence + (monotonic ? 2 : -3) };
}

function readTicks() {
  if (!state.loaded || !state.crop) return { ticks: [], side: null };
  const candidates = tickTextCandidates();
  if (!candidates.length) return { ticks: [], side: null };
  // Try every side and keep the one that yields the most valid numbers. Dark
  // pixel counts alone are unreliable because border lines are dark too.
  let best = null;
  for (const region of candidates) {
    const result = readTicksFromRegion(region);
    if (result.ticks.length > 0 && (!best || result.quality > best.quality)) best = result;
  }
  return best || { ticks: [], side: null };
}
return readTicks();
};
})(globalThis);


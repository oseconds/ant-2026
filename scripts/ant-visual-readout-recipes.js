export const READOUT_ALPHA = 112;
export const TENURE_SCALE_MS = 7_200_000;

export function buildReadoutRgba(top, width, height, layerOrder, birthTimeByLayer, simulationTimeMs, recipe) {
  const pixels = new Uint8ClampedArray(top.length * 4);
  const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l) / 100, k = n => (n + h / 30) % 12;
    const f = n => Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4)];
  };
  for (let i = 0; i < top.length; i += 1) {
    const layer = top[i];
    if (layer < 0) continue;
    let color;
    if (recipe === 'identity') color = hsl((layer * 137.508) % 360, 58, 43);
    else if (recipe === 'tenure') {
      const elapsed = Math.max(0, simulationTimeMs - birthTimeByLayer[layer]);
      const t = Math.min(1, elapsed / TENURE_SCALE_MS);
      color = [Math.round(220 - 150 * t), Math.round(90 + 75 * t), Math.round(45 + 105 * t)];
    } else if (recipe === 'boundaries') {
      const row = Math.floor(i / width), col = i % width;
      const right = col + 1 < width ? top[i + 1] : -1;
      const down = row + 1 < height ? top[i + width] : -1;
      if (!((right >= 0 && right !== layer) || (down >= 0 && down !== layer))) continue;
      color = [25, 25, 25];
    } else throw new TypeError(`Unknown readout recipe: ${recipe}`);
    pixels.set([...color, READOUT_ALPHA], i * 4);
  }
  return pixels;
}

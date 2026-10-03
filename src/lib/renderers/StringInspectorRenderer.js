/** Read-only inspector drawing. Canvas dimensions are configured by the UI. */
export class StringInspectorRenderer {
  constructor(overviewCanvas, detailCanvas) {
    this.overviewCanvas = overviewCanvas;
    this.detailCanvas = detailCanvas;
    this.overview = overviewCanvas?.getContext?.('2d') || null;
    this.detail = detailCanvas?.getContext?.('2d') || null;
  }

  render(snapshot) {
    const data = snapshot?.inspector;
    if (!data?.values?.length) { this.clear(); return; }
    this.drawOverview(data);
    this.drawDetail(data);
  }

  clear() {
    for (const [ctx, canvas] of [[this.overview, this.overviewCanvas], [this.detail, this.detailCanvas]]) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  drawOverview(data) {
    const ctx = this.overview, canvas = this.overviewCanvas;
    if (!ctx || !canvas) return;
    const { values, cursor } = data, { width, height } = canvas;
    const margin = 30, middle = height / 2, plotHeight = middle - 18;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '12px monospace'; ctx.fillStyle = '#333';
    ctx.fillText('+1', 2, 18); ctx.fillText('0', 12, middle - 3); ctx.fillText('−1', 2, height - 5);
    ctx.fillText('0', margin, height - 3); ctx.fillText(String(values.length - 1), width - margin - 32, height - 3);
    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(margin, middle); ctx.lineTo(width - margin, middle); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.beginPath();
    values.forEach((value, index) => {
      const x = margin + index / Math.max(1, values.length - 1) * (width - margin * 2);
      const y = middle - value * plotHeight;
      if (!index) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const cursorX = margin + cursor / Math.max(1, values.length - 1) * (width - margin * 2);
    ctx.strokeStyle = '#b00000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cursorX, 8); ctx.lineTo(cursorX, height - 15); ctx.stroke(); ctx.lineWidth = 1;
  }

  drawDetail(data) {
    const ctx = this.detail, canvas = this.detailCanvas;
    if (!ctx || !canvas) return;
    const { values, cursor, lastChangedPosition } = data;
    const { width, height } = canvas;
    const count = Math.min(width < 500 ? 8 : 16, values.length);
    const margin = 24, top = 28, bottom = height - 38, baseline = Math.floor((top + bottom) / 2);
    const plotHeight = (bottom - top) / 2 - 20, gap = 7;
    const cellWidth = (width - margin * 2 - gap * (count - 1)) / count;
    const first = (cursor - Math.floor(count / 2) + values.length) % values.length;
    ctx.clearRect(0, 0, width, height); ctx.font = '10px monospace';
    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(margin, baseline); ctx.lineTo(width - margin, baseline); ctx.stroke();
    for (let slot = 0; slot < count; slot++) {
      const index = (first + slot) % values.length, value = values[index];
      const x = margin + slot * (cellWidth + gap), y = baseline - value * plotHeight;
      const active = index === cursor, next = index === (cursor + 1) % values.length, changed = index === lastChangedPosition;
      ctx.fillStyle = active ? '#ffe5e5' : next ? '#e5f1ff' : changed ? '#e2f4e6' : '#f4f4f4';
      ctx.fillRect(x, top, cellWidth, bottom - top); ctx.strokeStyle = '#aaa'; ctx.strokeRect(x, top, cellWidth, bottom - top);
      ctx.fillStyle = active ? '#b00000' : next ? '#1266a8' : changed ? '#167532' : '#555';
      ctx.fillRect(x, Math.min(baseline, y), cellWidth, Math.max(2, Math.abs(y - baseline)));
      ctx.fillStyle = '#111'; ctx.textAlign = 'center';
      if (active || next || changed) ctx.fillText(active ? '현재' : next ? '다음' : '변경', x + cellWidth / 2, top + 13);
      ctx.fillText(String(index), x + cellWidth / 2, height - 25);
      ctx.fillText(value.toFixed(count <= 8 ? 1 : 2), x + cellWidth / 2, height - 8);
    }
    ctx.textAlign = 'start';
  }

  destroy() { this.clear(); this.overview = this.detail = null; this.overviewCanvas = this.detailCanvas = null; }
}

export default StringInspectorRenderer;

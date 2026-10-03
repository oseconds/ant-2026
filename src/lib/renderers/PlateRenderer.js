/** Draws plate displacement on a caller-owned canvas. Sizing and animation stay in the UI. */
export class PlateRenderer {
  constructor(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('PlateRenderer requires a canvas');
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    if (!this.context) throw new Error('2D canvas context is unavailable');
    this.destroyed = false;
  }

  render(snapshot, { time = 0 } = {}) {
    if (this.destroyed) return;
    const ctx = this.context, canvas = this.canvas;
    const width = canvas.width, height = canvas.height;
    const centerX = width / 2, centerY = height / 2;
    const plateRadius = Math.min(width, height) * 0.435;
    ctx.clearRect(0, 0, width, height);
    const face = ctx.createRadialGradient(centerX * 0.83, centerY * 0.72, 4, centerX, centerY, plateRadius);
    face.addColorStop(0, '#25343c'); face.addColorStop(0.72, '#1a262e'); face.addColorStop(1, '#111920');
    ctx.beginPath(); ctx.arc(centerX, centerY, plateRadius, 0, Math.PI * 2); ctx.fillStyle = face; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, plateRadius, 0, Math.PI * 2); ctx.clip();
    const frame = snapshot?.frame;
    if (frame?.values?.length && frame.size > 1) {
      const size = frame.size, radius = frame.radius, values = frame.values;
      let peak = 0;
      for (let i = 0; i < values.length; i++) peak = Math.max(peak, Math.abs(values[i]));
      const scale = Math.max(peak, 0.000003), spacing = (plateRadius * 2) / (size - 1), cellSize = spacing * 0.9;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = x - (size - 1) / 2, dy = y - (size - 1) / 2;
        if (dx * dx + dy * dy > radius * radius) continue;
        const value = values[y * size + x], amount = Math.min(1, Math.abs(value) / scale);
        if (amount < 0.025) continue;
        const alpha = 0.12 + amount * 0.8;
        ctx.fillStyle = value >= 0 ? `rgba(106, 235, 211, ${alpha})` : `rgba(255, 174, 111, ${alpha})`;
        const px = centerX + dx / radius * plateRadius - cellSize / 2;
        const py = centerY + dy / radius * plateRadius - cellSize / 2;
        ctx.fillRect(px, py, cellSize, cellSize);
      }
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(centerX, centerY, plateRadius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, width / 360); ctx.strokeStyle = 'rgba(143, 202, 198, .65)'; ctx.stroke();
    const pickup = snapshot?.state?.pickup?.position || { x: 0.28, y: -0.18 };
    const sensorX = centerX + pickup.x * plateRadius, sensorY = centerY + pickup.y * plateRadius;
    ctx.beginPath(); ctx.arc(sensorX, sensorY, width * 0.012, 0, Math.PI * 2); ctx.fillStyle = '#f3d68a'; ctx.fill();
    ctx.beginPath(); ctx.arc(sensorX, sensorY, width * 0.023, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, width / 480); ctx.strokeStyle = 'rgba(243, 214, 138, .65)'; ctx.stroke();
    const hit = snapshot?.state?.excitation?.position;
    if (hit) {
      const fade = snapshot.status === 'active' ? 0.55 + 0.2 * Math.sin(Number(time) / 100) : 0.35;
      ctx.beginPath(); ctx.arc(centerX + hit.x * plateRadius, centerY + hit.y * plateRadius, width * 0.025, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.stroke();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context = null;
    this.canvas = null;
  }
}

export default PlateRenderer;

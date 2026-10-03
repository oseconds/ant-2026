/** Canvas-only rendering for the string's Lorenz visual. Caller owns timing. */
export class StringRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.('2d') || null;
    this.points = makeLorenzPath();
  }

  render(snapshot, { time = 0 } = {}) {
    const ctx = this.context, canvas = this.canvas;
    if (!ctx || !canvas) return;
    const width = canvas.width, height = canvas.height;
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const pulse = snapshot?.status === 'playing' ? 1 : 0;
    const angle = time * .00012;
    const scale = Math.min(width, height) / 66;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    ctx.lineWidth = 1.05 + pulse * .35;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    this.points.forEach((p, i) => {
      const px = (p[0] * cos - p[1] * sin) * scale;
      const py = (p[2] - 25) * scale * .8 + (p[0] * sin + p[1] * cos) * scale * .2;
      const x = width / 2 + px, y = height / 2 - py;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = pulse ? '#a33b32' : '#34434d';
    ctx.stroke();
  }

  destroy() { this.context = null; this.canvas = null; this.points = []; }
}

function makeLorenzPath() {
  const points = [];
  let x = .1, y = 0, z = 0;
  const sigma = 10, rho = 28, beta = 8 / 3, dt = .005;
  for (let i = 0; i < 12500; i++) {
    const dx = sigma * (y - x), dy = x * (rho - z) - y, dz = x * y - beta * z;
    x += dx * dt; y += dy * dt; z += dz * dt;
    if (i > 900) points.push([x, y, z]);
  }
  return points;
}

export default StringRenderer;

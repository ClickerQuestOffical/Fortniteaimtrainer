import { aimToScreen } from './aimEngine.js';

export class AimRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 1;
    this.height = 1;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || window.innerWidth));
    const height = Math.max(1, Math.round(rect.height || window.innerHeight));

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = width;
    this.height = height;
  }

  clear() {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;
    const horizon = h * 0.43;

    // Sky.
    const sky = c.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#0e1724');
    sky.addColorStop(0.55, '#162536');
    sky.addColorStop(1, '#263b52');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, horizon);

    // Floor.
    const floor = c.createLinearGradient(0, horizon, 0, h);
    floor.addColorStop(0, '#24384a');
    floor.addColorStop(0.45, '#172838');
    floor.addColorStop(1, '#0a141e');
    c.fillStyle = floor;
    c.fillRect(0, horizon, w, h - horizon);

    // Soft center light to give the arena depth without clutter.
    const glow = c.createRadialGradient(
      w * 0.5,
      horizon * 0.9,
      20,
      w * 0.5,
      horizon * 0.9,
      Math.max(w, h) * 0.6,
    );
    glow.addColorStop(0, 'rgba(119,167,255,.12)');
    glow.addColorStop(1, 'rgba(119,167,255,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);

    // Mild vignette.
    const vignette = c.createRadialGradient(
      w * 0.5,
      h * 0.48,
      Math.min(w, h) * 0.18,
      w * 0.5,
      h * 0.48,
      Math.max(w, h) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.28)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, w, h);
  }

  drawGrid() {
    const c = this.ctx;
    const w = this.width;
    const h = this.height;
    const horizon = h * 0.43;
    const cx = w * 0.5;

    c.save();
    c.lineWidth = 1;

    // Horizon line.
    c.strokeStyle = 'rgba(164,189,220,.18)';
    c.beginPath();
    c.moveTo(0, horizon);
    c.lineTo(w, horizon);
    c.stroke();

    // Simple perspective floor lines. They converge toward the vanishing point.
    c.strokeStyle = 'rgba(145,169,199,.11)';
    for (let i = -8; i <= 8; i += 2) {
      const bottomX = cx + i * (w * 0.13);
      c.beginPath();
      c.moveTo(cx, horizon);
      c.lineTo(bottomX, h);
      c.stroke();
    }

    // Horizontal depth strips. The spacing expands toward the viewer.
    const depths = [0.03, 0.065, 0.11, 0.17, 0.26, 0.39, 0.55, 0.74, 0.91];
    for (const t of depths) {
      const y = horizon + Math.pow(t, 1.65) * (h - horizon);
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    // Minimal side-wall seams add 3D structure without a dense graph-paper look.
    c.strokeStyle = 'rgba(145,169,199,.08)';
    for (const side of [0.18, 0.34, 0.66, 0.82]) {
      const topX = w * (0.5 + (side - 0.5) * 0.48);
      const bottomX = w * side;
      c.beginPath();
      c.moveTo(topX, 0);
      c.lineTo(bottomX, horizon);
      c.stroke();
    }

    c.restore();
  }

  drawRangeMarkers(fov = 90) {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    c.save();
    c.strokeStyle = 'rgba(160,182,210,.08)';
    c.lineWidth = 1;

    // Two very subtle aim rings rather than three large circles.
    [0.34, 0.62].forEach((scale) => {
      c.beginPath();
      c.ellipse(
        cx,
        cy,
        this.width * 0.5 * scale,
        this.height * 0.5 * scale,
        0,
        0,
        Math.PI * 2,
      );
      c.stroke();
    });

    c.fillStyle = 'rgba(188,204,224,.58)';
    c.font = '10px Inter, system-ui, sans-serif';
    c.fillText(`${Math.round(fov)}° AIM FIELD`, 16, 20);
    c.restore();
  }

  projectTarget(target, cameraYaw = 0, cameraPitch = 0, fov = 90) {
    if (!target) return null;

    const worldYaw = Number.isFinite(target.worldYaw)
      ? target.worldYaw
      : Number(target.spawnYaw || 0);

    const worldPitch = Number.isFinite(target.worldPitch)
      ? target.worldPitch
      : Number(target.spawnPitch || 0);

    const relativeYaw = ((worldYaw - cameraYaw + 540) % 360) - 180;
    const relativePitch = worldPitch - cameraPitch;

    const point = aimToScreen(
      relativeYaw,
      relativePitch,
      this.width,
      this.height,
      fov,
    );

    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;

    return {
      ...point,
      relativeYaw,
      relativePitch,
      onScreen:
        point.x >= 0 &&
        point.x <= this.width &&
        point.y >= 0 &&
        point.y <= this.height,
    };
  }

  drawTrail(points = []) {
    if (!points.length) return;

    const c = this.ctx;
    const visible = points.slice(-28);
    if (visible.length < 2) return;

    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();

    visible.forEach((p, index) => {
      if (index === 0) c.moveTo(p.x, p.y);
      else c.lineTo(p.x, p.y);
    });

    c.strokeStyle = 'rgba(119,167,255,.17)';
    c.lineWidth = 2;
    c.stroke();
    c.restore();
  }

  drawTarget(target, cameraYaw = 0, cameraPitch = 0, fov = 90, active = true) {
    const point = this.projectTarget(target, cameraYaw, cameraPitch, fov);
    if (!point) return null;

    const c = this.ctx;
    const depth = clamp(target.depth ?? 1, 0.65, 1.45);
    const radius = Math.max(7, Number(target.radius) || 18) / depth;
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.018;
    const x = point.x;
    const y = point.y;
    const onScreen = point.onScreen;
    const alpha = onScreen ? 1 : 0.35;
    const normalizedError = clamp(
      Number(target.currentError ?? 180) / Math.max(20, target.acquisitionRange || 38),
      0,
      1,
    );
    const close = 1 - normalizedError;
    const side = radius * 1.55 * pulse;
    const corner = Math.max(5, radius * 0.18);

    c.save();
    c.globalAlpha = alpha;

    // Ground/air shadow to communicate that the target is floating in depth.
    c.fillStyle = 'rgba(0,0,0,.20)';
    c.beginPath();
    c.ellipse(x, y + side * 0.68, side * 0.55, side * 0.13, 0, 0, Math.PI * 2);
    c.fill();

    // Outer acquisition halo.
    c.beginPath();
    c.arc(x, y, radius * 1.88, 0, Math.PI * 2);
    c.strokeStyle = `rgba(119,167,255,${(0.10 + close * 0.28).toFixed(3)})`;
    c.lineWidth = 1.5;
    c.setLineDash([5, 6]);
    c.stroke();
    c.setLineDash([]);

    // Offset extrusion makes the target read as a 3D plate.
    const depthOffset = Math.max(3, radius * 0.14);
    c.beginPath();
    roundedRectPath(c, x - side / 2 + depthOffset, y - side / 2 + depthOffset, side, side, corner);
    c.fillStyle = 'rgba(38,61,82,.95)';
    c.fill();
    c.strokeStyle = 'rgba(119,167,255,.35)';
    c.lineWidth = 1;
    c.stroke();

    // Main plate.
    c.beginPath();
    roundedRectPath(c, x - side / 2, y - side / 2, side, side, corner);

    const surface = c.createLinearGradient(
      x - side / 2,
      y - side / 2,
      x + side / 2,
      y + side / 2,
    );
    surface.addColorStop(0, close > 0.8 ? '#f7fff9' : '#e4edf9');
    surface.addColorStop(1, close > 0.8 ? '#b9e9d1' : '#aec7e4');
    c.fillStyle = surface;
    c.fill();
    c.strokeStyle = close > 0.8 ? '#72ddb0' : '#79abeb';
    c.lineWidth = close > 0.8 ? 3 : 2;
    c.stroke();

    // Inner square makes the center unmistakable.
    const inner = side * 0.42;
    c.beginPath();
    roundedRectPath(
      c,
      x - inner / 2,
      y - inner / 2,
      inner,
      inner,
      Math.max(3, corner * 0.7),
    );
    c.strokeStyle = 'rgba(13,27,41,.52)';
    c.lineWidth = 2;
    c.stroke();

    // Center marker.
    c.beginPath();
    c.arc(x, y, Math.max(2.2, radius * 0.13), 0, Math.PI * 2);
    c.fillStyle = close > 0.8 ? '#57c895' : '#132337';
    c.fill();

    // Moving-target chevrons.
    if (target.type === 'moving') {
      const direction = (Number(target.direction || 0) * Math.PI) / 180;
      const tx = Math.cos(direction) * radius * 1.4;
      const ty = Math.sin(direction) * radius * 1.4;

      c.beginPath();
      c.moveTo(x + tx, y + ty);
      c.lineTo(
        x + tx - Math.cos(direction - 0.55) * 8,
        y + ty - Math.sin(direction - 0.55) * 8,
      );
      c.moveTo(x + tx, y + ty);
      c.lineTo(
        x + tx - Math.cos(direction + 0.55) * 8,
        y + ty - Math.sin(direction + 0.55) * 8,
      );
      c.strokeStyle = 'rgba(119,167,255,.9)';
      c.lineWidth = 1.7;
      c.stroke();
    }

    c.restore();

    if (!onScreen) {
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5;
      const angle = Math.atan2(point.y - centerY, point.x - centerX);
      const edge = Math.min(this.width, this.height) * 0.5 - 35;
      const ix = centerX + Math.cos(angle) * edge;
      const iy = centerY + Math.sin(angle) * edge;

      c.save();
      c.fillStyle = 'rgba(119,167,255,.72)';
      c.beginPath();
      c.moveTo(ix + Math.cos(angle) * 9, iy + Math.sin(angle) * 9);
      c.lineTo(ix + Math.cos(angle + 2.45) * 7, iy + Math.sin(angle + 2.45) * 7);
      c.lineTo(ix + Math.cos(angle - 2.45) * 7, iy + Math.sin(angle - 2.45) * 7);
      c.closePath();
      c.fill();
      c.restore();
    }

    return point;
  }

  drawAcquireFeedback(progress = 0) {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;
    const value = clamp(progress, 0, 1);

    if (value <= 0) return;

    c.save();
    c.strokeStyle = 'rgba(102,213,160,.92)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(cx, cy, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * value);
    c.stroke();
    c.restore();
  }

  drawCrosshair(style = 'cross') {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    c.save();
    c.strokeStyle = 'rgba(255,255,255,.96)';
    c.fillStyle = 'rgba(255,255,255,.96)';
    c.lineWidth = 1.5;

    // Small dark outline behind the white crosshair keeps it readable on bright targets.
    c.strokeStyle = 'rgba(0,0,0,.55)';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(cx - 10, cy);
    c.lineTo(cx + 10, cy);
    c.moveTo(cx, cy - 10);
    c.lineTo(cx, cy + 10);
    c.stroke();

    c.strokeStyle = 'rgba(255,255,255,.96)';
    c.lineWidth = 1.5;

    if (style === 'dot') {
      c.beginPath();
      c.arc(cx, cy, 2.7, 0, Math.PI * 2);
      c.fill();
    } else if (style === 'circle') {
      c.beginPath();
      c.arc(cx, cy, 7, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 1.7, 0, Math.PI * 2);
      c.fill();
    } else {
      const size = 9;
      const gap = 3;
      c.beginPath();
      c.moveTo(cx - size, cy);
      c.lineTo(cx - gap, cy);
      c.moveTo(cx + gap, cy);
      c.lineTo(cx + size, cy);
      c.moveTo(cx, cy - size);
      c.lineTo(cx, cy - gap);
      c.moveTo(cx, cy + gap);
      c.lineTo(cx, cy + size);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 1.4, 0, Math.PI * 2);
      c.fill();
    }

    c.restore();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function drawLineChart(canvas, series, labels) {
  const ctx = canvas.getContext('2d');
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight || 290);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = '#283449';
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const y = 24 + i * (h - 50) / 4;
    ctx.beginPath();
    ctx.moveTo(38, y);
    ctx.lineTo(w - 15, y);
    ctx.stroke();
  }

  series.forEach((s, si) => {
    if (!s?.values?.length) return;

    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = 42 + i * (w - 65) / Math.max(1, s.values.length - 1);
      const y = h - 28 - (v / 100) * (h - 56);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });

    ctx.strokeStyle = si === 0 ? '#77a7ff' : '#9a7cff';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  ctx.fillStyle = '#8391a8';
  ctx.font = '10px Inter, system-ui, sans-serif';

  [0, 25, 50, 75, 100].forEach((v, i) => {
    ctx.fillText(String(v), 8, h - 27 - i * (h - 56) / 4);
  });

  if (labels?.length) {
    ctx.fillText(labels[0], 42, h - 8);
  }
}

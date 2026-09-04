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
    const g = c.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, '#101925');
    g.addColorStop(0.55, '#0b131e');
    g.addColorStop(1, '#071018');
    c.fillStyle = g;
    c.fillRect(0, 0, this.width, this.height);

    const vignette = c.createRadialGradient(
      this.width * 0.5,
      this.height * 0.5,
      80,
      this.width * 0.5,
      this.height * 0.5,
      Math.max(this.width, this.height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(119,167,255,.045)');
    vignette.addColorStop(1, 'rgba(0,0,0,.16)');
    c.fillStyle = vignette;
    c.fillRect(0, 0, this.width, this.height);
  }

  drawGrid() {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    c.save();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(137,154,180,.12)';

    const spacing = 64;
    let startX = ((cx % spacing) + spacing) % spacing;
    let startY = ((cy % spacing) + spacing) % spacing;

    for (let x = startX; x < this.width; x += spacing) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, this.height);
      c.stroke();
    }

    for (let y = startY; y < this.height; y += spacing) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(this.width, y);
      c.stroke();
    }

    c.strokeStyle = 'rgba(119,167,255,.16)';
    c.beginPath();
    c.moveTo(cx, 0);
    c.lineTo(cx, this.height);
    c.stroke();

    c.beginPath();
    c.moveTo(0, cy);
    c.lineTo(this.width, cy);
    c.stroke();
    c.restore();

    // Subtle horizon plane.
    c.save();
    const horizonY = cy + this.height * 0.17;
    c.fillStyle = 'rgba(119,167,255,.018)';
    c.fillRect(0, horizonY, this.width, this.height - horizonY);
    c.restore();
  }

  drawRangeMarkers(fov = 90) {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    c.save();
    c.strokeStyle = 'rgba(119,167,255,.09)';
    c.lineWidth = 1;

    [0.25, 0.5, 0.75].forEach((scale) => {
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

    c.fillStyle = 'rgba(165,179,204,.62)';
    c.font = '10px Inter, system-ui, sans-serif';
    c.fillText(`${Math.round(fov)}° FOV MODEL`, 16, 20);
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
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';

    const visible = points.slice(-34);

    if (visible.length > 1) {
      c.beginPath();
      visible.forEach((p, index) => {
        if (index === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      });
      c.strokeStyle = 'rgba(119,167,255,.22)';
      c.lineWidth = 2;
      c.stroke();
    }

    visible.forEach((p, index) => {
      const alpha = (index + 1) / visible.length * 0.3;
      c.fillStyle = `rgba(119,167,255,${alpha.toFixed(3)})`;
      c.beginPath();
      c.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      c.fill();
    });

    c.restore();
  }

  drawTarget(
    target,
    cameraYaw = 0,
    cameraPitch = 0,
    fov = 90,
    active = true,
  ) {
    const point = this.projectTarget(
      target,
      cameraYaw,
      cameraPitch,
      fov,
    );

    if (!point) return null;

    const c = this.ctx;
    const radius = Math.max(6, Number(target.radius) || 18);
    const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.025;
    const x = point.x;
    const y = point.y;
    const onScreen = point.onScreen;
    const alpha = onScreen ? 1 : 0.42;
    const normalizedError = clamp01(
      Number(target.currentError || target.error || 180) / 40,
    );
    const close = 1 - normalizedError;

    c.save();
    c.globalAlpha = alpha;

    // Acquisition zone.
    c.beginPath();
    c.arc(x, y, radius * 1.95, 0, Math.PI * 2);
    c.strokeStyle = `rgba(119,167,255,${(0.12 + close * 0.25).toFixed(3)})`;
    c.lineWidth = 1;
    c.setLineDash([4, 5]);
    c.stroke();
    c.setLineDash([]);

    // Animated outer pulse.
    if (active) {
      c.beginPath();
      c.arc(x, y, radius * (2.15 + (pulse - 1) * 4), 0, Math.PI * 2);
      c.strokeStyle = 'rgba(119,167,255,.09)';
      c.stroke();
    }

    // Main target: a clean competitive square.
    const side = radius * 1.55 * pulse;
    const corner = Math.max(4, radius * 0.18);

    c.beginPath();
    roundedRectPath(c, x - side / 2, y - side / 2, side, side, corner);
    c.fillStyle = close > 0.75 ? '#eff7ff' : '#d9e6f8';
    c.fill();
    c.strokeStyle = close > 0.75 ? '#76d5ad' : '#77a7ff';
    c.lineWidth = close > 0.75 ? 3 : 2;
    c.stroke();

    // Inner acquisition square.
    const innerSide = side * 0.46;
    c.beginPath();
    roundedRectPath(c, x - innerSide / 2, y - innerSide / 2, innerSide, innerSide, Math.max(3, corner * 0.7));
    c.strokeStyle = 'rgba(11,20,32,.58)';
    c.lineWidth = 2;
    c.stroke();

    // Center dot.
    c.beginPath();
    c.arc(x, y, Math.max(2.4, radius * 0.14), 0, Math.PI * 2);
    c.fillStyle = close > 0.75 ? '#66d5a0' : '#101a28';
    c.fill();

    // Direction chevrons around the target.
    if (target.type === 'moving') {
      const direction = (Number(target.direction || 0) * Math.PI) / 180;
      const tx = Math.cos(direction) * radius * 1.35;
      const ty = Math.sin(direction) * radius * 1.35;

      c.beginPath();
      c.moveTo(x + tx, y + ty);
      c.lineTo(x + tx - Math.cos(direction - 0.55) * 7, y + ty - Math.sin(direction - 0.55) * 7);
      c.moveTo(x + tx, y + ty);
      c.lineTo(x + tx - Math.cos(direction + 0.55) * 7, y + ty - Math.sin(direction + 0.55) * 7);
      c.strokeStyle = 'rgba(119,167,255,.8)';
      c.lineWidth = 1.5;
      c.stroke();
    }

    c.restore();

    if (!onScreen) {
      const centerX = this.width * 0.5;
      const centerY = this.height * 0.5;
      const angle = Math.atan2(point.y - centerY, point.x - centerX);
      const edge = Math.min(this.width, this.height) * 0.5 - 28;
      const ix = centerX + Math.cos(angle) * edge;
      const iy = centerY + Math.sin(angle) * edge;

      c.save();
      c.fillStyle = 'rgba(119,167,255,.72)';
      c.beginPath();
      c.moveTo(ix + Math.cos(angle) * 9, iy + Math.sin(angle) * 9);
      c.lineTo(ix + Math.cos(angle + 2.4) * 7, iy + Math.sin(angle + 2.4) * 7);
      c.lineTo(ix + Math.cos(angle - 2.4) * 7, iy + Math.sin(angle - 2.4) * 7);
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
    const value = clamp01(progress);

    if (value <= 0) return;

    c.save();
    c.strokeStyle = 'rgba(102,213,160,.8)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(
      cx,
      cy,
      15,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * value,
    );
    c.stroke();
    c.restore();
  }

  drawCrosshair(style = 'cross') {
    const c = this.ctx;
    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    c.save();
    c.strokeStyle = 'rgba(255,255,255,.95)';
    c.fillStyle = 'rgba(255,255,255,.95)';
    c.lineWidth = 1.5;

    if (style === 'dot') {
      c.beginPath();
      c.arc(cx, cy, 2.6, 0, Math.PI * 2);
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

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
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

  if (labels?.length) ctx.fillText(labels[0], 42, h - 8);
}

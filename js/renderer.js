import { aimToScreen } from './aimEngine.js';

export class AimRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = 1;
    this.height = 1;

    this.resize();

    window.addEventListener('resize', () => {
      this.resize();
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();

    const width = Math.max(
      1,
      Math.round(rect.width || window.innerWidth)
    );

    const height = Math.max(
      1,
      Math.round(rect.height || (window.innerHeight - 110))
    );

    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);

    this.ctx.setTransform(
      this.dpr,
      0,
      0,
      this.dpr,
      0,
      0
    );

    this.width = width;
    this.height = height;
  }

  clear() {
    const ctx = this.ctx;

    const gradient = ctx.createLinearGradient(
      0,
      0,
      0,
      this.height
    );

    gradient.addColorStop(0, '#111b28');
    gradient.addColorStop(1, '#081018');

    ctx.fillStyle = gradient;
    ctx.fillRect(
      0,
      0,
      this.width,
      this.height
    );
  }

  drawGrid() {
    const ctx = this.ctx;

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;

    ctx.save();

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = '#7e90aa';
    ctx.lineWidth = 1;

    const spacing = 64;

    const startX =
      ((centerX % spacing) + spacing) % spacing;

    const startY =
      ((centerY % spacing) + spacing) % spacing;

    for (
      let x = startX;
      x < this.width;
      x += spacing
    ) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    for (
      let y = startY;
      y < this.height;
      y += spacing
    ) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.24;

    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, this.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(this.width, centerY);
    ctx.stroke();

    ctx.restore();
  }

  drawRangeMarkers(fov = 90) {
    const ctx = this.ctx;

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.5;

    ctx.save();

    ctx.strokeStyle = 'rgba(119,167,255,0.12)';
    ctx.lineWidth = 1;

    const scales = [0.25, 0.5, 0.75];

    for (const scale of scales) {
      ctx.beginPath();

      ctx.ellipse(
        centerX,
        centerY,
        this.width * 0.5 * scale,
        this.height * 0.5 * scale,
        0,
        0,
        Math.PI * 2
      );

      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(141,154,176,0.65)';
    ctx.font = '10px Inter, system-ui, sans-serif';

    ctx.fillText(
      `${Math.round(fov)}° FOV MODEL`,
      16,
      20
    );

    ctx.restore();
  }

  drawTarget(
    target,
    cameraYaw = 0,
    cameraPitch = 0,
    fov = 90,
    active = true
  ) {
    if (!target) {
      return;
    }

    /*
      Targets created by tests.js use spawnYaw/spawnPitch.

      Once the target is activated, app.js converts these into
      worldYaw/worldPitch.

      Supporting both here makes the renderer robust.
    */

    const worldYaw = Number.isFinite(target.worldYaw)
      ? target.worldYaw
      : Number(target.spawnYaw || 0);

    const worldPitch = Number.isFinite(target.worldPitch)
      ? target.worldPitch
      : Number(target.spawnPitch || 0);

    if (
      !Number.isFinite(worldYaw) ||
      !Number.isFinite(worldPitch)
    ) {
      return;
    }

    /*
      Calculate target position relative to camera.
    */

    const relativeYaw =
      ((worldYaw - cameraYaw + 540) % 360) - 180;

    const relativePitch =
      worldPitch - cameraPitch;

    const screenPosition = aimToScreen(
      relativeYaw,
      relativePitch,
      this.width,
      this.height,
      fov
    );

    if (
      !screenPosition ||
      !Number.isFinite(screenPosition.x) ||
      !Number.isFinite(screenPosition.y)
    ) {
      return;
    }

    const ctx = this.ctx;

    /*
      Keep targets visible at the edge of the screen when
      they are slightly outside the modeled FOV.
    */

    const margin = 22;

    const x = Math.max(
      margin,
      Math.min(
        this.width - margin,
        screenPosition.x
      )
    );

    const y = Math.max(
      margin,
      Math.min(
        this.height - margin,
        screenPosition.y
      )
    );

    const onScreen =
      screenPosition.x >= 0 &&
      screenPosition.x <= this.width &&
      screenPosition.y >= 0 &&
      screenPosition.y <= this.height;

    const alpha = onScreen ? 1 : 0.45;

    const radius = Math.max(
      4,
      Number(target.radius) || 18
    );

    /*
      Draw target.
    */

    ctx.save();

    ctx.globalAlpha = alpha;

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      radius,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      active
        ? '#dce9ff'
        : '#50617c';

    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#77a7ff';

    ctx.stroke();

    /*
      Target center.
    */

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      Math.max(3, radius * 0.2),
      0,
      Math.PI * 2
    );

    ctx.fillStyle = '#101825';
    ctx.fill();

    /*
      Center dot.
    */

    ctx.beginPath();

    ctx.arc(
      x,
      y,
      Math.max(1.5, radius * 0.08),
      0,
      Math.PI * 2
    );

    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    /*
      Off-screen target indicator.
    */

    if (!onScreen) {
      const angle = Math.atan2(
        screenPosition.y - this.height * 0.5,
        screenPosition.x - this.width * 0.5
      );

      const indicatorRadius =
        Math.min(
          this.width,
          this.height
        ) *
        0.5 -
        18;

      const ix =
        this.width * 0.5 +
        Math.cos(angle) * indicatorRadius;

      const iy =
        this.height * 0.5 +
        Math.sin(angle) * indicatorRadius;

      ctx.save();

      ctx.fillStyle = '#77a7ff';

      ctx.beginPath();

      ctx.moveTo(
        ix + Math.cos(angle) * 8,
        iy + Math.sin(angle) * 8
      );

      ctx.lineTo(
        ix + Math.cos(angle + 2.45) * 7,
        iy + Math.sin(angle + 2.45) * 7
      );

      ctx.lineTo(
        ix + Math.cos(angle - 2.45) * 7,
        iy + Math.sin(angle - 2.45) * 7
      );

      ctx.closePath();

      ctx.fill();

      ctx.restore();
    }
  }

  drawCrosshair() {
    const ctx = this.ctx;

    const cx = this.width * 0.5;
    const cy = this.height * 0.5;

    ctx.save();

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;

    const size = 7;
    const gap = 3;

    ctx.beginPath();

    ctx.moveTo(cx - size, cy);
    ctx.lineTo(cx - gap, cy);

    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + size, cy);

    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx, cy - gap);

    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + size);

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(
      cx,
      cy,
      1.5,
      0,
      Math.PI * 2
    );

    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();
  }
}

export function drawLineChart(
  canvas,
  series,
  labels
) {
  const ctx = canvas.getContext('2d');

  const width = Math.max(
    1,
    canvas.clientWidth
  );

  const height = Math.max(
    1,
    canvas.clientHeight || 290
  );

  const dpr =
    Math.min(window.devicePixelRatio || 1, 2);

  canvas.width =
    Math.round(width * dpr);

  canvas.height =
    Math.round(height * dpr);

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );

  ctx.clearRect(
    0,
    0,
    width,
    height
  );

  /*
    Grid.
  */

  ctx.strokeStyle = '#283449';
  ctx.lineWidth = 1;

  for (let i = 0; i < 5; i++) {
    const y =
      24 +
      i * (height - 50) / 4;

    ctx.beginPath();

    ctx.moveTo(38, y);
    ctx.lineTo(width - 15, y);

    ctx.stroke();
  }

  /*
    Series.
  */

  series.forEach((seriesItem, seriesIndex) => {
    if (
      !Array.isArray(seriesItem.values) ||
      !seriesItem.values.length
    ) {
      return;
    }

    ctx.beginPath();

    seriesItem.values.forEach(
      (value, index) => {
        const x =
          42 +
          index *
            (width - 65) /
            Math.max(
              1,
              seriesItem.values.length - 1
            );

        const y =
          height -
          28 -
          (value / 100) *
            (height - 56);

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
    );

    ctx.strokeStyle =
      seriesIndex === 0
        ? '#77a7ff'
        : '#9a7cff';

    ctx.lineWidth = 2;

    ctx.stroke();
  });

  /*
    Y-axis labels.
  */

  ctx.fillStyle = '#8391a8';

  ctx.font =
    '10px Inter, system-ui, sans-serif';

  [0, 25, 50, 75, 100]
    .forEach((value, index) => {
      ctx.fillText(
        String(value),
        8,
        height -
          27 -
          index *
            (height - 56) /
            4
      );
    });

  /*
    First label.
  */

  if (labels?.length) {
    ctx.fillText(
      labels[0],
      42,
      height - 8
    );
  }
}

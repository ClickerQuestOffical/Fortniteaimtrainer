import { clamp } from './utilities.js';

export class CameraEngine {
  constructor(settings) {
    this.setSettings(settings);
    this.yaw = 0;
    this.pitch = 0;
    this.last = { x: 0, y: 0 };
  }

  setSettings(s) {
    this.x = Number(s?.x) || 6.4;
    this.y = Number(s?.y) || 6.4;
    this.ads = Number(s?.ads) || 32.5;
    this.scope = Number(s?.scope) || 32.5;
    this.fov = Number(s?.fov) || 90;
  }

  sensitivityFor(mode = 'look') {
    if (mode === 'ads') return this.ads;
    if (mode === 'scope') return this.scope;
    return 1;
  }

  deltaToAngle(dx, dy, mode = 'look') {
    const ref = 90 / 6.4;
    const fovScale = this.fov / 90;
    const sensX = this.x * ref * fovScale;
    const sensY = this.y * ref * fovScale;
    const mult = this.sensitivityFor(mode);

    return {
      // Positive mouse X = look right.
      yaw: dx * sensX * 0.01 * mult,
      // IMPORTANT: positive mouse Y means the mouse moved DOWN.
      // Looking up must happen when the mouse moves UP (negative Y),
      // so invert the vertical input here.
      pitch: -dy * sensY * 0.01 * mult,
    };
  }

  move(dx, dy, mode = 'look') {
    const d = this.deltaToAngle(dx, dy, mode);
    this.yaw += d.yaw;
    this.pitch = clamp(this.pitch + d.pitch, -89, 89);
    return d;
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0;
  }
}

export function angularDistance(a, b) {
  let d = ((a - b + 180) % 360) - 180;
  return Math.abs(d);
}

export function screenToAim(px, py, w, h, fov) {
  const aspect = w / h;
  const nx = (px / w - 0.5) * 2;
  const ny = (py / h - 0.5) * 2;
  return {
    yaw: nx * (fov * 0.5),
    pitch: -ny * (fov * 0.5 / aspect),
  };
}

export function aimToScreen(yaw, pitch, w, h, fov) {
  const aspect = w / h;
  const nx = yaw / (fov * 0.5);
  const ny = -pitch / (fov * 0.5 / aspect);

  return {
    x: w * 0.5 + nx * w * 0.5,
    y: h * 0.5 + ny * h * 0.5,
  };
}

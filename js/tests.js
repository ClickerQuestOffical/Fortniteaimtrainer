import { seeded, randomNormal, clamp } from './utilities.js';

export const TESTS = [
  { id:'micro', name:'Micro Precision', short:'Micro', desc:'Small targets at comfortable screen angles. Move onto the center and stabilize.', duration:35, type:'static', targets:28 },
  { id:'largeFlick', name:'Large Flick', short:'Large Flick', desc:'Fast directional changes. Snap to the target and stop cleanly.', duration:32, type:'flick', targets:24 },
  { id:'smallFlick', name:'Small Flick', short:'Small Flick', desc:'Medium-angle precision switches. Control the final movement.', duration:32, type:'flickSmall', targets:24 },
  { id:'horizontal', name:'Horizontal Tracking', short:'H Track', desc:'Keep the crosshair on the moving target.', duration:30, type:'trackX', targets:1 },
  { id:'vertical', name:'Vertical Tracking', short:'V Track', desc:'Keep the crosshair on the moving target.', duration:30, type:'trackY', targets:1 },
  { id:'switching', name:'Reactive Target Switching', short:'Switching', desc:'Acquire each highlighted target, then transition immediately.', duration:30, type:'switch', targets:30 },
  { id:'random', name:'Random Angle Flick', short:'Angle Flick', desc:'Targets appear across varied directions while staying inside the useful visual field.', duration:35, type:'random', targets:30 },
  { id:'close', name:'Close Range Speed', short:'Close Speed', desc:'Large nearby targets with rapid changes.', duration:28, type:'close', targets:30 },
  { id:'long', name:'Long Range Precision', short:'Long Precision', desc:'Small distant-feeling targets that reward controlled movement.', duration:35, type:'long', targets:26 },
  { id:'fatigue', name:'Fatigue / Consistency', short:'Fatigue', desc:'A longer mixed drill reveals late-session instability.', duration:55, type:'fatigue', targets:44 },
];

export function makeScenario(test, settings, seed = 1) {
  const r = seeded(seed);
  const targets = [];

  const fov = Number(settings?.fov || 90);
  const aspectParts = String(settings?.aspect || '16:9').split(':').map(Number);
  const aspect = aspectParts[1] ? aspectParts[0] / aspectParts[1] : 16 / 9;

  // These bounds are intentionally conservative so normal aim drills
  // never require the player to leave the visible screen or "turn" around.
  const maxYaw = Math.min(30, fov * 0.34);
  const maxPitch = Math.min(15, (fov * 0.5 / Math.max(0.5, aspect)) * 0.34);

  const screenAngles = [
    [-0.84, -0.45],
    [-0.60, -0.12],
    [-0.32, 0.32],
    [0.02, -0.50],
    [0.26, 0.20],
    [0.54, -0.30],
    [0.80, 0.08],
    [-0.74, 0.48],
    [-0.30, -0.70],
    [0.34, 0.65],
    [0.76, 0.47],
    [-0.12, 0.12],
  ];

  const count = test.targets || 1;

  for (let i = 0; i < count; i += 1) {
    let x;
    let y;
    let radius;
    let velocity = 0;
    let depth = 0.86 + r() * 0.24;

    if (test.type === 'trackX' || test.type === 'trackY') {
      x = test.type === 'trackX' ? 0 : (r() - 0.5) * 0.4;
      y = (r() - 0.5) * 0.55;
      radius = 26;
      velocity = 48 + 45 * r();
    } else {
      const slot = screenAngles[i % screenAngles.length];
      x = slot[0] + randomNormal(r) * 0.055;
      y = slot[1] + randomNormal(r) * 0.05;

      if (test.type === 'random') {
        x = (r() * 1.66) - 0.83;
        y = (r() * 1.40) - 0.70;
      }

      if (test.type === 'largeFlick') {
        radius = 20;
      } else if (test.type === 'flickSmall') {
        radius = 12;
      } else if (test.type === 'micro') {
        radius = 11;
      } else if (test.type === 'close') {
        radius = 30;
      } else if (test.type === 'long') {
        radius = 9;
      } else {
        radius = 17;
      }

      if (test.type === 'fatigue') {
        const progress = i / Math.max(1, count - 1);
        radius = clamp(29 - progress * 17, 11, 29);
      }

      // Make the pseudo-depth visual only; it does not alter aim math.
      depth = 0.78 + r() * 0.5;
    }

    x = clamp(x, -0.86, 0.86);
    y = clamp(y, -0.72, 0.72);

    targets.push({
      id: i,
      spawnTime: i * 850 + 250,
      spawnYaw: x * maxYaw,
      spawnPitch: y * maxPitch,
      radius,
      depth,
      acquisitionRange: test.type === 'micro' || test.type === 'long' ? 34 : 42,
      velocity,
      direction: test.type === 'trackY' ? (r() > 0.5 ? 90 : 270) : (r() > 0.5 ? 0 : 180),
      type: test.type === 'trackX' || test.type === 'trackY' ? 'moving' : 'static',
    });
  }

  return targets;
}

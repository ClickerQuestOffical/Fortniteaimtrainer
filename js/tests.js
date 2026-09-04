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

  const aspectParts = String(settings?.aspect || '16:9').split(':').map(Number);
  const aspect = aspectParts[1] ? aspectParts[0] / aspectParts[1] : 16 / 9;
  const verticalFov = Number(settings?.fov || 90) / Math.max(0.5, aspect);
  const maxYaw = Math.min(41, Number(settings?.fov || 90) * 0.5 * 0.82);
  const maxPitch = Math.min(19.5, verticalFov * 0.5 * 0.78);
  const comfortableAngles = [-maxYaw, -maxYaw * 0.78, -maxYaw * 0.55, -maxYaw * 0.32, -maxYaw * 0.15, maxYaw * 0.15, maxYaw * 0.32, maxYaw * 0.55, maxYaw * 0.78, maxYaw];

  for (let i = 0; i < (test.targets || 1); i++) {
    let a;
    let p;
    let radius;
    let velocity;
    let depth;

    if (test.type === 'trackX' || test.type === 'trackY') {
      a = test.type === 'trackX' ? 0 : (r() > 0.5 ? 12 : -12);
      p = (r() - 0.5) * 10;
      radius = 22;
      velocity = 48 + 45 * r();
      depth = 0.9 + r() * 0.35;
    } else {
      if (test.type === 'largeFlick') {
        a = comfortableAngles[i % comfortableAngles.length] + randomNormal(r) * 5;
        p = (r() - 0.5) * maxPitch * 2;
      } else if (test.type === 'smallFlick') {
        a = comfortableAngles[i % comfortableAngles.length] + randomNormal(r) * 4;
        p = (r() - 0.5) * maxPitch * 1.7;
      } else if (test.type === 'random') {
        a = comfortableAngles[Math.floor(r() * comfortableAngles.length)] + randomNormal(r) * 8;
        p = (r() - 0.5) * maxPitch * 2;
      } else if (test.type === 'long') {
        a = comfortableAngles[Math.floor(r() * comfortableAngles.length)] + randomNormal(r) * 5;
        p = (r() - 0.5) * maxPitch * 1.8;
      } else {
        a = comfortableAngles[i % comfortableAngles.length] + randomNormal(r) * 4;
        p = (r() - 0.5) * maxPitch * 1.6;
      }

      if (test.type === 'micro') radius = 11;
      else if (test.type === 'flickSmall') radius = 10;
      else if (test.type === 'close') radius = 28;
      else if (test.type === 'largeFlick') radius = 19;
      else if (test.type === 'long') radius = 8;
      else radius = 16;

      if (test.type === 'fatigue') {
        const progress = i / Math.max(1, test.targets - 1);
        radius = clamp(30 - progress * 18, 10, 30);
        p *= 0.85;
      }

      // Pseudo-depth affects target scale/visual perspective, not sensitivity math.
      depth = 0.72 + r() * 0.62;
      velocity = 0;
    }

    a = clamp(a, -maxYaw, maxYaw);
    p = clamp(p, -maxPitch, maxPitch);

    targets.push({
      id: i,
      spawnTime: i * 900 + 300,
      spawnYaw: a,
      spawnPitch: p,
      radius,
      depth,
      acquisitionRange: test.type === 'micro' || test.type === 'long' ? 34 : 42,
      velocity,
      direction: a,
      type: test.type === 'trackX' || test.type === 'trackY' ? 'moving' : 'static',
    });
  }

  return targets;
}

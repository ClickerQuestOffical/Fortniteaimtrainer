import {
  seeded,
  randomNormal,
  clamp
} from './utilities.js';

export const TESTS = [
  {
    id: 'micro',
    name: 'Micro Precision',
    short: 'Micro',
    desc:
      'Small static targets. Measures first-shot error, correction burden, and stable precision.',
    duration: 35,
    type: 'static',
    targets: 28
  },

  {
    id: 'largeFlick',
    name: 'Large Flick',
    short: 'Large Flick',
    desc:
      'Fast, unpredictable angle changes. Measures acquisition speed and overshoot.',
    duration: 32,
    type: 'flick',
    targets: 24
  },

  {
    id: 'smallFlick',
    name: 'Small Flick',
    short: 'Small Flick',
    desc:
      'Medium-to-large angular switches with small targets. Measures stopping control.',
    duration: 32,
    type: 'flickSmall',
    targets: 24
  },

  {
    id: 'horizontal',
    name: 'Horizontal Tracking',
    short: 'H Track',
    desc:
      'Constant and variable horizontal target motion. Measures smooth pursuit and jitter.',
    duration: 30,
    type: 'trackX',
    targets: 1
  },

  {
    id: 'vertical',
    name: 'Vertical Tracking',
    short: 'V Track',
    desc:
      'Vertical movement isolates Y-axis control.',
    duration: 30,
    type: 'trackY',
    targets: 1
  },

  {
    id: 'switching',
    name: 'Reactive Target Switching',
    short: 'Switching',
    desc:
      'Sequential target swaps measure transition time and path efficiency.',
    duration: 30,
    type: 'switch',
    targets: 30
  },

  {
    id: 'random',
    name: 'Random Angle Flick',
    short: 'Angle Flick',
    desc:
      'Targets span all major direction sectors plus seeded random angles.',
    duration: 35,
    type: 'random',
    targets: 30
  },

  {
    id: 'close',
    name: 'Close Range Speed',
    short: 'Close Speed',
    desc:
      'Large nearby targets with fast changes. Measures high-speed acquisition.',
    duration: 28,
    type: 'close',
    targets: 30
  },

  {
    id: 'long',
    name: 'Long Range Precision',
    short: 'Long Precision',
    desc:
      'Small distant targets emphasize controlled micro-adjustment.',
    duration: 35,
    type: 'long',
    targets: 26
  },

  {
    id: 'fatigue',
    name: 'Fatigue / Consistency',
    short: 'Fatigue',
    desc:
      'A longer mixed drill reveals performance drift and late-session instability.',
    duration: 55,
    type: 'fatigue',
    targets: 44
  }
];

export function makeScenario(
  test,
  settings,
  seed = 1
) {
  const random = seeded(seed);

  const targets = [];

  /*
    These are visual/angular direction anchors.

    The actual world position is created later relative
    to the player's camera by app.js.
  */

  const angularDirections = [
    0,
    15,
    30,
    45,
    60,
    90,
    120,
    135,
    150,
    180,
    210,
    225,
    240,
    270,
    300,
    315,
    330,
    345
  ];

  const targetCount =
    test.targets || 1;

  for (
    let i = 0;
    i < targetCount;
    i++
  ) {
    let angle;
    let pitch;
    let radius;
    let velocity;

    /*
      Tracking tests.
    */

    if (
      test.type === 'trackX' ||
      test.type === 'trackY'
    ) {
      angle =
        test.type === 'trackX'
          ? 0
          : random() > 0.5
            ? 90
            : -90;

      pitch =
        (random() - 0.5) * 8;

      radius = 22;

      velocity =
        35 +
        40 * random();
    }

    /*
      Flick / precision / mixed tests.
    */

    else {
      const baseAngle =
        angularDirections[
          i % angularDirections.length
        ];

      /*
        Add seeded noise so patterns aren't
        perfectly predictable.
      */

      angle =
        baseAngle +
        (randomNormal(random) * 7);

      /*
        Use more dramatic pitch variation for
        long-range and random-angle tests.
      */

      if (test.type === 'long') {
        pitch =
          (random() - 0.5) * 55;
      } else if (
        test.type === 'flickSmall'
      ) {
        pitch =
          (random() - 0.5) * 45;
      } else if (
        test.type === 'random'
      ) {
        pitch =
          (random() - 0.5) * 65;
      } else {
        pitch =
          (random() - 0.5) * 55;
      }

      /*
        Target sizing.
      */

      if (
        test.type === 'long' ||
        test.type === 'micro' ||
        test.type === 'flickSmall'
      ) {
        radius = 8;
      } else if (
        test.type === 'close'
      ) {
        radius = 30;
      } else if (
        test.type === 'largeFlick'
      ) {
        radius = 22;
      } else if (
        test.type === 'fatigue'
      ) {
        const progress =
          i /
          Math.max(
            1,
            test.targets - 1
          );

        radius = clamp(
          34 -
            progress * 25,
          9,
          34
        );
      } else {
        radius = 18;
      }

      velocity = 0;
    }

    /*
      Normalize the angle to 0–360.
    */

    angle =
      ((angle % 360) + 360) % 360;

    /*
      Keep pitch within a realistic
      camera pitch range.
    */

    pitch = clamp(
      pitch,
      -72,
      72
    );

    /*
      Build the target object.

      spawnYaw/spawnPitch represent the target's
      position relative to the camera when it spawns.

      app.js converts them into worldYaw/worldPitch.
    */

    targets.push({
      id: i,

      spawnTime:
        i * 900 + 300,

      spawnYaw: angle,

      spawnPitch: pitch,

      radius,

      angularPosition: angle,

      velocity,

      direction: angle,

      type:
        test.type === 'trackX' ||
        test.type === 'trackY'
          ? 'moving'
          : 'static',

      hit: false,

      worldYaw: null,

      worldPitch: null,

      spawnAbs: 0,

      travel: 0
    });
  }

  return targets;
}

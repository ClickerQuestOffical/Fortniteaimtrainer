import { load, save, reset as resetStore } from './storage.js';
import { TESTS, makeScenario } from './tests.js';
import { CameraEngine } from './aimEngine.js';
import { AimRenderer } from './renderer.js';
import { analyzeRun } from './analyzer.js';
import { optimize } from './optimizer.js';
import {
  clamp,
  format,
  mean,
  nowIso,
  uuid,
} from './utilities.js';

const state = load();
const app = document.querySelector('#app');
const overlay = document.querySelector('#testOverlay');
const canvas = document.querySelector('#aimCanvas');
const renderer = new AimRenderer(canvas);

let currentTest = null;
let testRuntime = null;
let lastAnalysis = null;
let lastOptimization = null;
let calibrationCancel = null;

const routes = {};

function qs(selector) {
  return document.querySelector(selector);
}

function setStatus(text, good = true) {
  const label = qs('#globalStatus');
  const dot = qs('#globalStatusDot');
  if (label) label.textContent = text;
  if (dot) dot.style.background = good ? 'var(--good)' : 'var(--warn)';
}

function toast(message) {
  const el = qs('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

function shell(title, sub = '') {
  return `
    <div class="section-head">
      <div>
        <div class="eyebrow">AimFoundry</div>
        <h1 class="page-title">${title}</h1>
        <div class="muted">${sub}</div>
      </div>
    </div>
  `;
}

function metricBar(label, value) {
  const safe = clamp(Number(value) || 0, 0, 100);
  return `
    <div class="bar-row">
      <span>${label}</span>
      <div class="bar"><span style="width:${safe}%"></span></div>
      <b>${Math.round(safe)}</b>
    </div>
  `;
}

function navigate(route = 'landing') {
  if (location.hash.slice(1) === route) {
    render(route);
    return;
  }
  location.hash = route;
}

function render(route = 'landing') {
  const routeHandler = routes[route] || routes.landing;
  document.querySelectorAll('.nav button').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route);
  });
  routeHandler();
  window.scrollTo(0, 0);
}

function browserSupportsPointerLock() {
  return typeof canvas?.requestPointerLock === 'function';
}

function resetOverlay() {
  overlay?.classList.remove('hidden');
  qs('#pausePanel')?.classList.add('hidden');
  qs('#pointerHint')?.classList.remove('hidden');
  qs('#testTimer').textContent = '00.0';
  qs('#testTargets').textContent = '0 / 0';
  qs('#testFps').textContent = '-- FPS';
}

function releasePointerLock() {
  if (document.pointerLockElement) {
    try {
      document.exitPointerLock();
    } catch {
      // Browser may reject exit during a transition.
    }
  }
}

function endOverlay() {
  releasePointerLock();
  overlay?.classList.add('hidden');
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mergeAnalyses(analyses) {
  if (!analyses.length) return null;

  const numericKeys = [
    'precision',
    'flickSpeed',
    'microControl',
    'stoppingControl',
    'tracking',
    'reaction',
    'movementEfficiency',
    'consistency',
    'horizontalControl',
    'verticalControl',
  ];

  const metrics = {};
  for (const key of numericKeys) {
    const values = analyses
      .map((analysis) => safeNumber(analysis.metrics?.[key], 50))
      .filter(Number.isFinite);
    metrics[key] = values.length ? mean(values) : 50;
  }

  const weaknessMap = new Map();
  for (const analysis of analyses) {
    for (const weakness of analysis.weaknesses || []) {
      const existing = weaknessMap.get(weakness.id);
      if (!existing) {
        weaknessMap.set(weakness.id, { ...weakness, count: 1 });
      } else {
        existing.count += 1;
        existing.confidence = Math.max(
          existing.confidence || 0,
          weakness.confidence || 0,
        );
      }
    }
  }

  const weaknesses = [...weaknessMap.values()].sort(
    (a, b) => b.count - a.count || (b.confidence || 0) - (a.confidence || 0),
  );

  const sectorBuckets = {};
  const distanceBuckets = {};

  for (const analysis of analyses) {
    for (const [key, value] of Object.entries(analysis.sector || {})) {
      (sectorBuckets[key] ||= []).push(value);
    }
    for (const [key, value] of Object.entries(analysis.distance || {})) {
      (distanceBuckets[key] ||= []).push(value);
    }
  }

  const sector = Object.fromEntries(
    Object.entries(sectorBuckets).map(([key, values]) => [key, mean(values)]),
  );

  const distance = Object.fromEntries(
    Object.entries(distanceBuckets).map(([key, values]) => [key, mean(values)]),
  );

  const quality = mean(analyses.map((analysis) => safeNumber(analysis.quality, 0)));
  const counts = {
    telemetry: analyses.reduce((sum, analysis) => sum + safeNumber(analysis.counts?.telemetry), 0),
    acquisitions: analyses.reduce((sum, analysis) => sum + safeNumber(analysis.counts?.acquisitions), 0),
  };

  return {
    metrics,
    weaknesses,
    primary: weaknesses[0],
    sector,
    distance,
    quality,
    counts,
    confidence: quality,
  };
}

routes.landing = () => {
  app.innerHTML = `
    <section class="hero">
      <div>
        <div class="eyebrow">Mouse telemetry · diagnostics · optimization</div>
        <h1>Find the sensitivity that fits <span style="color:var(--accent)">your aim.</span></h1>
        <p>
          Stop guessing your Fortnite sensitivity. Run controlled aim drills,
          capture raw movement telemetry, identify exactly where your aim breaks down,
          and search a stable sensitivity region around the way you actually play.
        </p>
        <div class="button-row">
          <button class="btn primary" id="startBtn">START AIM ANALYSIS</button>
          <button class="btn ghost" id="howBtn">HOW IT WORKS</button>
          <button class="btn ghost" id="testsBtn">VIEW TESTS</button>
        </div>
        <div class="footer-note">
          Browser-based analysis is a measured approximation, not a claim of perfect
          in-game parity. Your result is a recommendation derived from your recorded behavior.
        </div>
      </div>
      <div class="hero-card">
        <div class="radar"><div class="radar-ring"></div><div class="radar-dot"></div></div>
        <div class="hero-caption">LIVE ANALYTICS FIELD · telemetry ready</div>
      </div>
    </section>
  `;

  qs('#startBtn').onclick = () => navigate('setup');
  qs('#howBtn').onclick = () => toast('Calibrate → test → diagnose → optimize → validate.');
  qs('#testsBtn').onclick = () => navigate('tests');
};

routes.setup = () => {
  app.innerHTML = `
    ${shell('Player setup', 'Your current settings are the baseline the optimizer will protect and improve.')}
    <div class="steps">
      <span class="step active"></span><span class="step"></span><span class="step"></span>
      <span class="step"></span><span class="step"></span>
    </div>

    <div class="grid grid-2">
      <div class="panel">
        <h3>Core Fortnite sensitivity</h3>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>LOOK X</label><input id="sx" type="number" step="0.01" min="0.01" max="100" value="${state.settings.x}"></div>
          <div class="field"><label>LOOK Y</label><input id="sy" type="number" step="0.01" min="0.01" max="100" value="${state.settings.y}"></div>
          <div class="field"><label>TARGETING / ADS</label><input id="sads" type="number" step="0.1" min="0" max="100" value="${state.settings.ads}"></div>
          <div class="field"><label>SCOPE</label><input id="sscope" type="number" step="0.1" min="0" max="100" value="${state.settings.scope}"></div>
        </div>
        <div style="margin-top:18px">
          <div class="metric-label" style="margin-bottom:8px">Preset</div>
          <div class="preset-row">
            <button class="chip" data-p="equal">X = Y</button>
            <button class="chip" data-p="balanced">Competitive Balanced</button>
            <button class="chip" data-p="speed">High Speed</button>
            <button class="chip" data-p="precision">Precision</button>
            <button class="chip active" data-p="custom">Custom</button>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>Mouse & display</h3>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>MOUSE DPI</label><input id="dpi" type="number" min="100" max="50000" value="${state.settings.dpi}"></div>
          <div class="field"><label>WINDOWS SENS</label><input id="windows" type="number" min="1" max="11" value="${state.settings.windows}"></div>
          <div class="field"><label>FOV</label><select id="fov">${[80,85,90,95,100,105].map((v) => `<option ${v == state.settings.fov ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>RESOLUTION</label><select id="resolution">${['1920x1080','2560x1440','1366x768','1600x900'].map((v) => `<option ${v === state.settings.resolution ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>ASPECT</label><select id="aspect">${['16:9','16:10','4:3','21:9'].map((v) => `<option ${v === state.settings.aspect ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>POLLING RATE</label><select id="polling">${[125,250,500,1000,2000,4000,8000].map((v) => `<option ${v == state.settings.polling ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>FPS ESTIMATE</label><input id="fps" type="number" min="30" max="1000" value="${state.settings.fps}"></div>
          <div class="field" style="justify-content:end"><label><input id="accel" type="checkbox" ${state.settings.accel ? 'checked' : ''}> Mouse acceleration enabled</label></div>
        </div>
      </div>
    </div>

    <div class="button-row"><button class="btn primary" id="continueSetup">SAVE & CALIBRATE</button></div>
  `;

  app.querySelectorAll('[data-p]').forEach((button) => {
    button.onclick = () => {
      const preset = button.dataset.p;
      const x = state.settings.x;
      if (preset === 'equal') state.settings.y = x;
      if (preset === 'balanced') {
        state.settings.x = x;
        state.settings.y = x * 0.96;
        state.settings.ads = 32;
      }
      if (preset === 'speed') {
        state.settings.x = x * 1.08;
        state.settings.y = x * 1.04;
        state.settings.ads = 35;
      }
      if (preset === 'precision') {
        state.settings.x = x * 0.92;
        state.settings.y = x * 0.90;
        state.settings.ads = 28;
      }
      state.settings.preset = preset;
      render('setup');
    };
  });

  qs('#continueSetup').onclick = () => {
    Object.assign(state.settings, {
      x: safeNumber(qs('#sx').value, state.settings.x),
      y: safeNumber(qs('#sy').value, state.settings.y),
      ads: safeNumber(qs('#sads').value, state.settings.ads),
      scope: safeNumber(qs('#sscope').value, state.settings.scope),
      dpi: safeNumber(qs('#dpi').value, state.settings.dpi),
      windows: safeNumber(qs('#windows').value, state.settings.windows),
      fov: safeNumber(qs('#fov').value, state.settings.fov),
      resolution: qs('#resolution').value,
      aspect: qs('#aspect').value,
      polling: safeNumber(qs('#polling').value, state.settings.polling),
      fps: safeNumber(qs('#fps').value, state.settings.fps),
      accel: qs('#accel').checked,
    });
    save(state);
    navigate('calibration');
  };
};

routes.calibration = () => {
  app.innerHTML = `
    ${shell('Sensitivity calibration', 'Establish the practical mouse-to-camera model before collecting diagnostic data.')}
    <div class="steps">
      <span class="step done"></span><span class="step active"></span><span class="step"></span>
      <span class="step"></span><span class="step"></span>
    </div>
    <div class="grid grid-2">
      <div class="panel">
        <div class="eyebrow">Protocol</div>
        <h3 style="font-size:22px;margin-top:8px">Calibrate your control envelope</h3>
        <p class="muted" style="line-height:1.7">
          The browser cannot read Fortnite internals. This calibration captures your pointer
          movement behavior and binds every drill to one mathematical camera model.
        </p>
        <div class="list" style="margin-top:18px">
          <div class="list-row"><span>Small movement</span><b>fine control</b></div>
          <div class="list-row"><span>90° movement</span><b>large movement</b></div>
          <div class="list-row"><span>180° movement</span><b>full range</b></div>
          <div class="list-row"><span>Vertical movement</span><b>Y-axis response</b></div>
        </div>
        <button class="btn primary" id="startCal" style="margin-top:22px">START CALIBRATION</button>
      </div>
      <div class="panel">
        <div class="eyebrow">Browser support</div>
        <div class="grid grid-2" style="margin-top:14px">
          <div class="metric-value" style="font-size:28px">Pointer Lock</div>
          <div class="right ${browserSupportsPointerLock() ? 'success' : 'warning'}" style="padding-top:8px">
            ${browserSupportsPointerLock() ? 'AVAILABLE' : 'UNAVAILABLE'}
          </div>
        </div>
        <div class="subtle-note" style="margin-top:20px">
          Click the training area to activate pointer capture. If pointer lock is unavailable,
          the trainer records less reliable input data and lowers confidence.
        </div>
        <canvas id="calChart" class="canvas-chart" style="margin-top:18px"></canvas>
      </div>
    </div>
  `;

  qs('#startCal').onclick = () => startCalibration();
};

function startCalibration() {
  calibrationCancel?.();

  const run = {
    started: performance.now(),
    samples: [],
    lastEvent: performance.now(),
  };

  resetOverlay();
  qs('#testName').textContent = 'Sensitivity Calibration';
  qs('#testPhase').textContent = ' • move naturally';
  qs('#testInstruction').textContent =
    'Click the field, then perform a small movement, 90° turn, 180° turn, and vertical sweep.';

  const camera = new CameraEngine(state.settings);
  let stage = 0;
  let totalTravel = 0;
  let active = true;

  const onClick = () => {
    try {
      canvas.requestPointerLock?.();
    } catch {
      // Fall back to regular pointer events.
    }
    qs('#pointerHint')?.classList.add('hidden');
    stage = Math.min(stage + 1, 4);
    totalTravel = 0;
  };

  const onMove = (event) => {
    if (!active) return;
    if (document.pointerLockElement !== canvas) return;

    const now = performance.now();
    const dt = Math.max(0.25, now - run.lastEvent);
    run.lastEvent = now;

    const dx = safeNumber(event.movementX);
    const dy = safeNumber(event.movementY);
    const delta = camera.move(dx, dy);
    const travel = Math.hypot(dx, dy);

    totalTravel += travel;
    run.samples.push({
      t: now - run.started,
      stage,
      eX: dx,
      eY: dy,
      dx: delta.yaw,
      dy: delta.pitch,
      speed: (travel / dt) * 1000,
      totalTravel,
    });
  };

  const onKey = (event) => {
    if (event.key === 'Escape') finish();
  };

  const finish = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('mousemove', onMove);
    releasePointerLock();
    calibrationCancel = null;

    const travelValues = run.samples.map((sample) => Math.hypot(sample.eX, sample.eY));
    const speedValues = run.samples.map((sample) => sample.speed);

    state.calibration = {
      sampleCount: run.samples.length,
      avgTravel: mean(travelValues),
      maxTravel: Math.max(0, ...travelValues),
      maxSpeed: Math.max(0, ...speedValues),
      capturedAt: nowIso(),
      stagesCompleted: stage,
    };

    save(state);
    endOverlay();
    setStatus('Calibration complete');
    toast('Calibration captured. Your diagnostics are ready.');
    navigate('tests');
  };

  calibrationCancel = finish;
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);
  window.addEventListener('keydown', onKey);
  setStatus('Calibration active', false);

  const start = performance.now();
  const loop = (now) => {
    if (!active) return;
    renderer.resize();
    renderer.clear();
    renderer.drawGrid();
    renderer.drawRangeMarkers(state.settings.fov);
    renderer.drawCrosshair();

    qs('#testTimer').textContent = ((now - start) / 1000).toFixed(1);

    if (now - start >= 20000) {
      finish();
      return;
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

routes.tests = () => {
  const completed = new Set(state.lastRun?.completed || []);

  app.innerHTML = `
    ${shell('Aim test suite', 'Ten drills isolate speed, precision, tracking, stopping control, and consistency.')}
    <div class="steps">
      <span class="step done"></span><span class="step done"></span><span class="step active"></span>
      <span class="step"></span><span class="step"></span>
    </div>

    <div class="panel">
      <div style="display:flex;justify-content:space-between;gap:20px;align-items:center">
        <div>
          <h3>Diagnostic battery</h3>
          <div class="muted small">Every drill uses the same camera model and raw telemetry pipeline.</div>
        </div>
        <button class="btn primary" id="startAll">RUN FULL BATTERY</button>
      </div>

      <div style="margin-top:20px">
        ${TESTS.map((test, index) => `
          <div class="test-card">
            <div class="test-meta">
              <span class="test-tag">${String(index + 1).padStart(2, '0')}</span>
              <h3 style="margin-top:8px">${test.name}</h3>
              <div class="muted small">${test.desc}</div>
            </div>
            <div class="right">
              <div class="metric-label">${completed.has(test.id) ? 'COMPLETED' : 'READY'}</div>
              <button class="btn ghost" data-test="${test.id}" style="margin-top:8px">
                ${completed.has(test.id) ? 'RETEST' : 'START'}
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <div class="eyebrow">Adaptive selection</div>
      <h3 style="font-size:20px;margin-top:8px">Future runs can target your biggest uncertainty.</h3>
      <p class="muted small">
        Once enough data exists, the diagnostics can prioritize metrics with the widest uncertainty
        rather than relying on a fixed sequence forever.
      </p>
    </div>
  `;

  app.querySelectorAll('[data-test]').forEach((button) => {
    button.onclick = () => {
      const test = TESTS.find((item) => item.id === button.dataset.test);
      if (test) runTest(test);
    };
  });

  qs('#startAll').onclick = () => runBattery();
};

async function runBattery() {
  state.lastRun = {
    sessionId: uuid(),
    completed: [],
    runs: [],
  };
  save(state);

  setStatus('Battery active', false);

  for (const test of TESTS) {
    await runTest(test, true);
  }

  setStatus('Battery complete');
  navigate('analysis');
}

function runTest(test, chained = false) {
  return new Promise((resolve) => {
    currentTest = test;
    startAimTest(test, () => {
      if (!state.lastRun) {
        state.lastRun = { sessionId: uuid(), completed: [], runs: [] };
      }

      state.lastRun.completed = [
        ...(state.lastRun.completed || []).filter((id) => id !== test.id),
        test.id,
      ];

      save(state);
      currentTest = null;
      setStatus('Ready');

      if (chained) {
        resolve();
      } else {
        navigate('analysis');
        resolve();
      }
    });
  });
}

function startAimTest(test, onDone) {
  if (testRuntime?.active) return;

  resetOverlay();
  overlay?.classList.remove('hidden');
  renderer.resize();

  const seed = Math.floor(Math.random() * 0xffffffff);
  const scenario = makeScenario(test, state.settings, seed);
  const camera = new CameraEngine(state.settings);
  const start = performance.now();

  const runtime = {
    active: true,
    done: false,
    pausedAt: 0,
    pausedTotal: 0,
    scenario,
    camera,
    currentIndex: 0,
    activeTarget: null,
    telemetry: [],
    frames: [],
    lastFrame: performance.now(),
    lastMove: performance.now(),
    seed,
    test,
    start,
    onDone,
    tickHandle: 0,
    clicks: 0,
    pointerLocked: false,
    startedInput: false,
    acquireStartedAt: 0,
    acquireDuration: 175,
    feedback: 0,
    feedbackUntil: 0,
    pointerFallback: false,
    movementPath: [],
    meaningfulMovementAt: 0,
    lastAngularError: Infinity,
    recoil: 0,
  };

  testRuntime = runtime;

  qs('#testName').textContent = test.name;
  qs('#testPhase').textContent = ` • ${test.short}`;
  qs('#testInstruction').textContent = getTestPrompt(test);
  qs('#testTimer').textContent = '00.0';
  qs('#testTargets').textContent = `0 / ${scenario.length}`;
  qs('#testFps').textContent = '-- FPS';
  qs('#testHint').textContent = 'Move your crosshair onto the target • ESC to pause';

  const finishOnce = () => finishAimTest(runtime);

  runtime.spawnNext = () => {
    if (!runtime.active || runtime.currentIndex >= runtime.scenario.length) {
      finishOnce();
      return;
    }

    const target = runtime.scenario[runtime.currentIndex];

    target.worldYaw = normalizeYaw(
      runtime.camera.yaw + safeNumber(target.spawnYaw),
    );
    target.worldPitch = clamp(
      safeNumber(target.spawnPitch),
      -85,
      85,
    );
    target.spawnAbs = performance.now();
    target.travel = 0;
    target.hit = false;
    target.firstError = null;
    target.currentError = Infinity;
    target.correctionCount = 0;
    target.overshootEvents = 0;
    target.undershootEvents = 0;
    target.maxErrorAfterFirstMove = 0;
    target.minError = Infinity;
    target.zoneEnteredAt = 0;
    target.stableAt = 0;
    target.lastSignedYaw = null;
    target.lastError = Infinity;
    target.path = [];

    runtime.acquireStartedAt = 0;
    runtime.feedback = 0;
    runtime.feedbackUntil = 0;
    runtime.movementPath = [];
    runtime.meaningfulMovementAt = 0;
    runtime.lastAngularError = Infinity;
    runtime.activeTarget = target;

    updateTargetInstruction(runtime);
  };

  runtime.activatePointer = async () => {
    if (!runtime.active || runtime.pausedAt) return;

    try {
      if (document.pointerLockElement !== canvas) {
        await canvas.requestPointerLock?.();
      }
      runtime.pointerFallback = false;
    } catch {
      runtime.pointerFallback = true;
    }

    qs('#pointerHint')?.classList.add('hidden');
    runtime.startedInput = true;
  };

  runtime.onMove = (event) => {
    if (!runtime.active || runtime.pausedAt) return;

    const locked = document.pointerLockElement === canvas;
    if (!locked && !runtime.pointerFallback) return;

    runtime.startedInput = true;
    const now = performance.now();
    const dt = Math.max(0.25, now - runtime.lastMove);
    runtime.lastMove = now;

    const dx = runtime.pointerFallback
      ? safeNumber(event.movementX || event.clientX - runtime.lastClientX)
      : safeNumber(event.movementX);
    const dy = runtime.pointerFallback
      ? safeNumber(event.movementY || event.clientY - runtime.lastClientY)
      : safeNumber(event.movementY);

    runtime.lastClientX = event.clientX;
    runtime.lastClientY = event.clientY;

    if (dx === 0 && dy === 0) return;

    const delta = runtime.camera.move(dx, dy);
    const mouseTravel = Math.hypot(dx, dy);
    const speed = (mouseTravel / dt) * 1000;
    const target = runtime.activeTarget;

    if (target) {
      target.travel += mouseTravel;

      const yawError = angularDistance(
        runtime.camera.yaw,
        target.worldYaw,
      );
      const pitchError =
        runtime.camera.pitch - target.worldPitch;
      const angularError = Math.hypot(
        yawError,
        pitchError,
      );
      const tolerance = targetHitTolerance(target);
      const signedYaw = signedAngularDifference(
        runtime.camera.yaw,
        target.worldYaw,
      );

      target.currentError = angularError;
      target.minError = Math.min(target.minError, angularError);
      target.maxErrorAfterFirstMove = Math.max(
        target.maxErrorAfterFirstMove,
        angularError,
      );

      if (!runtime.meaningfulMovementAt && mouseTravel >= 1) {
        runtime.meaningfulMovementAt = now;
        target.firstError = angularError;
        target.firstMovementAt = now;
        target.firstDirection = signedYaw;
      }

      if (target.lastSignedYaw != null) {
        const crossedCenter =
          Math.sign(target.lastSignedYaw) !== Math.sign(signedYaw) &&
          Math.abs(target.lastSignedYaw) > 1 &&
          Math.abs(signedYaw) > 1;

        if (crossedCenter) {
          target.correctionCount += 1;
          if (Math.abs(target.lastSignedYaw) < Math.abs(signedYaw)) {
            target.overshootEvents += 1;
          } else {
            target.undershootEvents += 1;
          }
        }
      }

      if (
        angularError <= tolerance &&
        target.zoneEnteredAt === 0
      ) {
        target.zoneEnteredAt = now;
      }

      if (
        angularError > tolerance * 1.3 &&
        target.zoneEnteredAt
      ) {
        target.zoneEnteredAt = 0;
        target.stableAt = 0;
      }

      if (angularError <= tolerance * 0.55) {
        if (!target.stableAt) target.stableAt = now;
      } else {
        target.stableAt = 0;
      }

      target.lastSignedYaw = signedYaw;
      target.lastError = angularError;

      runtime.movementPath.push({
        x: renderer.width * 0.5 + signedYaw * (renderer.width / Math.max(1, state.settings.fov)),
        y: renderer.height * 0.5 - pitchError * (renderer.height / Math.max(1, state.settings.fov)),
        t: now,
      });

      runtime.movementPath = runtime.movementPath.slice(-36);
    }

    runtime.telemetry.push({
      kind: 'sample',
      timestamp: now - runtime.start - runtime.pausedTotal,
      mouseX: dx,
      mouseY: dy,
      deltaX: delta.yaw,
      deltaY: delta.pitch,
      cameraYaw: runtime.camera.yaw,
      cameraPitch: runtime.camera.pitch,
      targetYaw: target?.worldYaw ?? 0,
      targetPitch: target?.worldPitch ?? 0,
      crosshairTargetDistance: target?.currentError ?? 999,
      mouseSpeed: speed,
      targetVelocity: target?.velocity ?? 0,
      isOnTarget:
        target
          ? target.currentError <= targetHitTolerance(target)
          : false,
      clickState: false,
    });
  };

  // Clicking is no longer required to acquire a target.
  runtime.onClick = () => {
    runtime.clicks += 1;
    runtime.activatePointer();
  };

  runtime.onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      togglePause(runtime);
    }
  };

  runtime.onPointerLock = () => {
    const locked = document.pointerLockElement === canvas;
    runtime.pointerLocked = locked;

    if (locked) {
      qs('#pointerHint')?.classList.add('hidden');
      qs('#testInstruction').textContent = getActiveInstruction(test);
    }

    if (!locked && runtime.active && !runtime.pausedAt) {
      const elapsed =
        performance.now() - runtime.start - runtime.pausedTotal;
      if (elapsed > 900 && runtime.startedInput) {
        togglePause(runtime, true);
      }
    }
  };

  canvas.addEventListener('mousemove', runtime.onMove, { passive: true });
  canvas.addEventListener('click', runtime.onClick);
  window.addEventListener('keydown', runtime.onKey);
  document.addEventListener('pointerlockchange', runtime.onPointerLock);

  canvas.onclick = () => runtime.activatePointer();

  runtime.spawnNext();
  setStatus('Test active', false);

  runtime.tickHandle = requestAnimationFrame((now) =>
    testFrame(runtime, now),
  );
}

function getTestPrompt(test) {
  if (test.type === 'trackX' || test.type === 'trackY') {
    return 'Keep your crosshair on the moving target. Hold it there naturally.';
  }

  if (test.type === 'switch') {
    return 'Move to the glowing target. Stabilize on its center, then switch.';
  }

  if (test.type === 'flick' || test.type === 'flickSmall' || test.type === 'random') {
    return 'Move quickly to the glowing target — no click needed.';
  }

  return 'Aim at the glowing target and hold steady. No click needed.';
}

function getActiveInstruction(test) {
  if (test.type === 'trackX' || test.type === 'trackY') {
    return 'Track the target. Stay smooth.';
  }

  if (test.type === 'switch') {
    return 'Acquire → stabilize → switch.';
  }

  if (test.type === 'flick' || test.type === 'flickSmall' || test.type === 'random') {
    return 'Acquire the target. No click required.';
  }

  return 'Center the target and hold steady.';
}

function updateTargetInstruction(runtime) {
  const target = runtime.activeTarget;
  const test = runtime.test;

  if (!target) return;

  if (test.type === 'trackX' || test.type === 'trackY') {
    qs('#testInstruction').textContent = 'Track the target. Stay smooth.';
    return;
  }

  qs('#testInstruction').textContent =
    runtime.currentIndex === 0
      ? 'Acquire the target with your crosshair.'
      : 'Next target — move, stop, stabilize.';
}

function testFrame(runtime, now) {
  if (!runtime.active || testRuntime !== runtime) return;

  const frameDelta = Math.max(0.1, now - runtime.lastFrame);
  runtime.lastFrame = now;
  runtime.frames.push(frameDelta);

  if (!runtime.pausedAt) {
    const elapsed = Math.max(
      0,
      now - runtime.start - runtime.pausedTotal,
    );

    qs('#testTimer').textContent = (elapsed / 1000).toFixed(1);

    if (runtime.activeTarget?.type === 'moving') {
      updateMovingTarget(runtime, now);
    }

    const target = runtime.activeTarget;

    if (target) {
      const yawError = angularDistance(
        runtime.camera.yaw,
        target.worldYaw,
      );
      const pitchError =
        runtime.camera.pitch - target.worldPitch;
      const angularError = Math.hypot(
        yawError,
        pitchError,
      );

      target.currentError = angularError;

      const tolerance = targetHitTolerance(target);

      if (angularError <= tolerance) {
        if (!target.zoneEnteredAt) {
          target.zoneEnteredAt = now;
        }

        const stableElapsed =
          now - target.zoneEnteredAt;

        runtime.feedback = clamp(
          stableElapsed / runtime.acquireDuration,
          0,
          1,
        );

        if (stableElapsed >= runtime.acquireDuration) {
          recordAcquisition(runtime, target, now);
          target.hit = true;
          runtime.recoil = 1;
          runtime.feedbackUntil = now + 180;
          runtime.currentIndex += 1;
          qs('#testTargets').textContent =
            `${runtime.currentIndex} / ${runtime.scenario.length}`;

          runtime.spawnNext();
        }
      } else {
        runtime.feedback = 0;
        if (angularError > tolerance * 1.35) {
          target.zoneEnteredAt = 0;
        }
      }
    }

    drawTrainingField(runtime, now);

    const averageFrame = mean(runtime.frames.slice(-90));
    const fps = averageFrame > 0 ? 1000 / averageFrame : 0;
    qs('#testFps').textContent = `${fps.toFixed(0)} FPS`;

    if (
      elapsed >= runtime.test.duration * 1000 ||
      runtime.currentIndex >= runtime.scenario.length
    ) {
      finishAimTest(runtime);
      return;
    }
  } else {
    drawTrainingField(runtime, now);
  }

  runtime.tickHandle = requestAnimationFrame((nextNow) =>
    testFrame(runtime, nextNow),
  );
}

function drawTrainingField(runtime, now = performance.now()) {
  renderer.resize();
  renderer.clear();
  renderer.drawGrid();
  renderer.drawRangeMarkers(state.settings.fov);

  const target = runtime.activeTarget;

  if (runtime.movementPath.length > 1) {
    renderer.drawTrail(runtime.movementPath);
  }

  if (target && !target.hit) {
    target.currentError = Math.hypot(
      angularDistance(runtime.camera.yaw, target.worldYaw),
      runtime.camera.pitch - target.worldPitch,
    );

    renderer.drawTarget(
      target,
      runtime.camera.yaw,
      runtime.camera.pitch,
      state.settings.fov,
      true,
    );
  }

  renderer.drawCrosshair(
    state.settings.crosshair || 'cross',
  );

  renderer.drawAcquireFeedback(
    runtime.feedback,
  );

  // Subtle first-person weapon model. It never controls aim; it is
  // only a visual anchor so the field reads like a shooter range.
  renderer.drawWeapon('rifle', runtime.recoil);
  runtime.recoil *= 0.86;

  // Small dynamic state indicator.
  const c = renderer.ctx;
  const cx = renderer.width * 0.5;
  const statusY = renderer.height * 0.5 + 46;

  c.save();
  c.textAlign = 'center';
  c.font = '600 10px Inter, system-ui, sans-serif';
  c.fillStyle =
    runtime.feedback > 0.8
      ? 'rgba(102,213,160,.9)'
      : 'rgba(141,154,176,.72)';

  if (target?.currentError <= targetHitTolerance(target)) {
    c.fillText(
      runtime.feedback >= 1 ? 'ACQUIRED' : 'STABILIZING',
      cx,
      statusY,
    );
  }

  if (now < runtime.feedbackUntil) {
    c.fillStyle = 'rgba(102,213,160,.85)';
    c.fillText('TARGET ACQUIRED', cx, statusY - 22);
  }

  c.restore();
}

function updateMovingTarget(runtime, now) {
  const target = runtime.activeTarget;
  if (!target) return;

  const dt = Math.max(0, now - runtime.lastFrame) / 1000;
  const progress = Math.min(
    1,
    Math.max(
      0,
      (now - target.spawnAbs) / Math.max(1, runtime.test.duration * 1000),
    ),
  );

  const direction =
    target.direction == null
      ? safeNumber(target.spawnYaw)
      : safeNumber(target.direction);

  const speedScale =
    0.022 + progress * 0.018;

  if (runtime.test.type === 'trackX') {
    const safeYaw = Math.min(29, safeNumber(state.settings.fov, 90) * 0.33);
    target.worldYaw = Math.max(
      -safeYaw,
      Math.min(
        safeYaw,
        signedAngularDifference(target.worldYaw, 0) +
          Math.sin(now * 0.0012) *
          safeNumber(target.velocity, 50) *
          speedScale *
          dt,
      ),
    );
  } else if (runtime.test.type === 'trackY') {
    const aspectParts = String(state.settings.aspect || '16:9').split(':').map(Number);
    const aspect = aspectParts[1] ? aspectParts[0] / aspectParts[1] : 16 / 9;
    const safePitch = Math.min(14, (safeNumber(state.settings.fov, 90) * 0.5 / Math.max(0.5, aspect)) * 0.31);
    target.worldPitch = clamp(
      target.worldPitch +
        Math.cos(now * 0.001) *
        safeNumber(target.velocity, 50) *
        speedScale *
        dt,
      -safePitch,
      safePitch,
    );
  }

  // Give moving targets a visual direction that reflects their actual behavior.
  target.direction = direction +
    (runtime.test.type === 'trackY' ? 90 : 0);

  const error = Math.hypot(
    angularDistance(runtime.camera.yaw, target.worldYaw),
    runtime.camera.pitch - target.worldPitch,
  );

  const recentSamples = runtime.telemetry
    .slice(-16)
    .filter((sample) => sample.kind === 'sample');

  const jitter = recentSamples.length
    ? mean(
        recentSamples.map((sample) =>
          Math.hypot(
            sample.deltaX || 0,
            sample.deltaY || 0,
          ),
        ),
      )
    : 0;

  runtime.telemetry.push({
    kind: 'tracking',
    timestamp: now - runtime.start - runtime.pausedTotal,
    trackError: error,
    jitter,
    targetVelocity: target.velocity,
  });
}

function recordAcquisition(runtime, target, now) {
  const yawError = angularDistance(
    runtime.camera.yaw,
    target.worldYaw,
  );
  const pitchError = runtime.camera.pitch - target.worldPitch;
  const finalError = Math.hypot(yawError, pitchError);
  const tolerance = targetHitTolerance(target);

  if (finalError > tolerance) return false;

  const firstError = target.firstError ?? finalError;
  const signedYaw = signedAngularDifference(
    runtime.camera.yaw,
    target.worldYaw,
  );
  const acquisition = Math.max(
    1,
    now - (target.spawnAbs || now),
  );
  const travel = Math.max(1, target.travel || 1);
  const correctionDistance = Math.hypot(
    signedYaw,
    pitchError,
  );

  const overshootEvents =
    safeNumber(target.overshootEvents) +
    (Math.abs(signedYaw) > Math.max(1.5, tolerance * 0.5) ? 1 : 0);

  const undershootEvents =
    safeNumber(target.undershootEvents);

  const correctionCount = Math.max(
    0,
    safeNumber(target.correctionCount),
  );

  const score = clamp(
    100 -
      (finalError / Math.max(1, tolerance)) * 35 -
      Math.min(30, correctionCount * 4),
    0,
    100,
  );

  runtime.telemetry.push({
    kind: 'acquisition',
    timestamp: now - runtime.start - runtime.pausedTotal,
    targetId: target.id,
    error: finalError,
    finalError,
    firstError,
    overshoot:
      overshootEvents > 0 ? 1 : 0,
    undershoot:
      undershootEvents > 0 ? 1 : 0,
    overshootEvents,
    undershootEvents,
    correctionEfficiency: clamp(
      correctionDistance / travel,
      0,
      1,
    ),
    movementEfficiency: clamp(
      tolerance / Math.max(tolerance, travel),
      0.1,
      1,
    ),
    reaction: Math.max(
      0,
      target.firstMovementAt
        ? target.firstMovementAt - target.spawnAbs
        : acquisition,
    ),
    acquisition,
    score,
    correctionCount,
    stabilizationTime:
      target.zoneEnteredAt
        ? Math.max(
            0,
            now - target.zoneEnteredAt,
          )
        : 0,
    sector: sectorName(
      target.spawnYaw,
      target.spawnPitch,
    ),
    distanceBucket: distanceBucket(
      Math.abs(target.spawnYaw),
    ),
  });

  return true;
}

function finishAimTest(runtime) {
  if (!runtime.active || runtime.done) return;
  runtime.done = true;
  runtime.active = false;

  window.cancelAnimationFrame(runtime.tickHandle);
  canvas.removeEventListener('mousemove', runtime.onMove);
  canvas.removeEventListener('click', runtime.onClick);
  window.removeEventListener('keydown', runtime.onKey);
  document.removeEventListener('pointerlockchange', runtime.onPointerLock);
  canvas.onclick = null;

  const elapsed = Math.max(
    1,
    performance.now() - runtime.start - runtime.pausedTotal,
  );

  const frames = runtime.frames.length
    ? runtime.frames
    : [16.67];
  const averageFrame = mean(frames);
  const frameVariance = mean(
    frames.map((frame) =>
      (frame - averageFrame) ** 2,
    ),
  );

  const acquisitionScores = runtime.telemetry
    .filter((item) => item.kind === 'acquisition')
    .map((item) => item.score || 0);

  const early = acquisitionScores.slice(0, 10);
  const late = acquisitionScores.slice(-10);

  const trackingSamples = runtime.telemetry.filter(
    (item) => item.kind === 'tracking',
  );
  const trackingError = trackingSamples.length
    ? mean(
        trackingSamples.map((item) =>
          item.trackError || 0,
        ),
      )
    : 0;

  let axis = { x: 0, y: 0 };
  if (runtime.test.type === 'trackX') {
    axis.x = clamp(
      100 - trackingError * 4,
      0,
      100,
    );
  } else if (runtime.test.type === 'trackY') {
    axis.y = clamp(
      100 - trackingError * 4,
      0,
      100,
    );
  }

  const movementSamples = runtime.telemetry.filter(
    (item) => item.kind === 'sample',
  );

  const avgMouseSpeed = movementSamples.length
    ? mean(
        movementSamples.map((item) =>
          safeNumber(item.mouseSpeed),
        ),
      )
    : 0;

  const maxMouseSpeed = movementSamples.length
    ? Math.max(
        ...movementSamples.map((item) =>
          safeNumber(item.mouseSpeed),
        ),
      )
    : 0;

  const run = {
    id: uuid(),
    testId: runtime.test.id,
    seed: runtime.seed,
    settings: { ...state.settings },
    telemetry: runtime.telemetry,
    expectedSamples: Math.max(
      250,
      Math.round((elapsed / 16) * 2),
    ),
    frame: {
      avg:
        averageFrame > 0
          ? 1000 / averageFrame
          : 60,
      variance: frameVariance,
    },
    fatigueTrend:
      runtime.test.type === 'fatigue'
        ? mean(late) - mean(early)
        : 0,
    axis,
    duration: elapsed,
    movement: {
      averageMouseSpeed: avgMouseSpeed,
      maxMouseSpeed,
      pointerLocked: runtime.pointerLocked,
      fallback: runtime.pointerFallback,
      clicks: runtime.clicks,
    },
  };

  if (!state.lastRun) {
    state.lastRun = {
      sessionId: uuid(),
      completed: [],
      runs: [],
    };
  }

  state.lastRun.runs = [
    ...(state.lastRun.runs || []).filter(
      (existing) =>
        existing.testId !== runtime.test.id,
    ),
    run,
  ];

  save(state);
  testRuntime = null;
  releasePointerLock();
  endOverlay();
  setStatus('Test complete');
  runtime.onDone?.();
}

function togglePause(runtime, forcePause = false) {
  if (!runtime.active || runtime.done) return;

  if (runtime.pausedAt) {
    resumeTest(runtime);
    return;
  }

  if (!forcePause && document.pointerLockElement !== canvas) return;

  runtime.pausedAt = performance.now();
  releasePointerLock();
  qs('#pausePanel')?.classList.remove('hidden');
  setStatus('Paused', false);
}

function resumeTest(runtime) {
  if (!runtime.pausedAt) return;

  runtime.pausedTotal += performance.now() - runtime.pausedAt;
  runtime.pausedAt = 0;
  runtime.lastMove = performance.now();

  qs('#pausePanel')?.classList.add('hidden');
  try {
    canvas.requestPointerLock?.();
  } catch {
    // User can click the field again if the browser rejects the request.
  }
  setStatus('Test active', false);
}

function restartTest(runtime) {
  if (!runtime?.test) return;

  const test = runtime.test;
  const onDone = runtime.onDone;
  runtime.active = false;
  runtime.done = true;
  window.cancelAnimationFrame(runtime.tickHandle);
  canvas.removeEventListener('mousemove', runtime.onMove);
  canvas.removeEventListener('click', runtime.onClick);
  window.removeEventListener('keydown', runtime.onKey);
  document.removeEventListener('pointerlockchange', runtime.onPointerLock);
  canvas.onclick = null;
  releasePointerLock();
  testRuntime = null;
  endOverlay();

  window.setTimeout(() => startAimTest(test, onDone), 0);
}

function exitTest(runtime) {
  if (!runtime) return;

  runtime.active = false;
  runtime.done = true;
  window.cancelAnimationFrame(runtime.tickHandle);
  releasePointerLock();
  canvas.removeEventListener('mousemove', runtime.onMove);
  canvas.removeEventListener('click', runtime.onClick);
  window.removeEventListener('keydown', runtime.onKey);
  document.removeEventListener('pointerlockchange', runtime.onPointerLock);
  canvas.onclick = null;
  testRuntime = null;
  endOverlay();
  setStatus('Test exited');
  runtime.onDone?.();
}

function sectorName(yaw, pitch) {
  const angle = (Math.atan2(pitch, Math.cos((yaw * Math.PI) / 180)) * 180 / Math.PI + 360) % 360;
  if (angle < 22.5 || angle >= 337.5) return 'Right';
  if (angle < 67.5) return 'Up-right';
  if (angle < 112.5) return 'Up';
  if (angle < 157.5) return 'Up-left';
  if (angle < 202.5) return 'Left';
  if (angle < 247.5) return 'Down-left';
  if (angle < 292.5) return 'Down';
  return 'Down-right';
}

function distanceBucket(angle) {
  if (angle < 30) return '0-30';
  if (angle < 60) return '30-60';
  if (angle < 90) return '60-90';
  if (angle < 135) return '90-135';
  return '135-180';
}

function normalizeYaw(value) {
  return ((value % 360) + 360) % 360;
}

function signedAngularDifference(from, to) {
  return ((from - to + 540) % 360) - 180;
}

function angularDistance(a, b) {
  return Math.abs(signedAngularDifference(a, b));
}

function targetHitTolerance(target) {
  const radius = Math.max(4, safeNumber(target.radius, 18));
  return clamp(radius * 0.22, 2.5, 8);
}

routes.analysis = () => {
  const runs = state.lastRun?.runs || [];
  if (!runs.length) {
    app.innerHTML = `
      ${shell('Analysis', 'Complete at least one drill to generate diagnostics.')}
      <div class="empty">
        No telemetry session is available yet.
        <br>
        <button class="btn primary" id="goTests" style="margin-top:16px">OPEN TEST SUITE</button>
      </div>
    `;
    qs('#goTests').onclick = () => navigate('tests');
    return;
  }

  const analyses = runs.map(analyzeRun);
  lastAnalysis = mergeAnalyses(analyses);
  lastOptimization = optimize(state.settings, lastAnalysis);

  app.innerHTML = `
    ${shell('Aim diagnostics', 'The system isolates weaknesses before choosing a sensitivity.')}
    <div class="steps">
      <span class="step done"></span><span class="step done"></span><span class="step done"></span>
      <span class="step active"></span><span class="step"></span>
    </div>

    <div class="grid grid-3">
      <div class="panel">
        <div class="metric-label">Data quality</div>
        <div class="metric-value">${Math.round(lastAnalysis.quality)}%</div>
        <div class="muted small">${lastAnalysis.counts.acquisitions} acquisition events · ${lastAnalysis.counts.telemetry} telemetry samples</div>
      </div>
      <div class="panel">
        <div class="metric-label">Primary weakness</div>
        <div class="metric-value" style="font-size:25px">${lastAnalysis.primary?.name || 'No dominant weakness'}</div>
        <div class="muted small">${lastAnalysis.primary?.evidence || 'Performance is comparatively balanced.'}</div>
      </div>
      <div class="panel">
        <div class="metric-label">Optimizer confidence</div>
        <div class="metric-value">${lastOptimization.confidence}%</div>
        <div class="muted small">Stable-region score: ${lastOptimization.stability}%</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel">
        <h3>Aim profile</h3>
        <div class="bars" style="margin-top:18px">
          ${metricBar('Precision', lastAnalysis.metrics.precision)}
          ${metricBar('Flick Speed', lastAnalysis.metrics.flickSpeed)}
          ${metricBar('Micro Control', lastAnalysis.metrics.microControl)}
          ${metricBar('Stopping', lastAnalysis.metrics.stoppingControl)}
          ${metricBar('Tracking', lastAnalysis.metrics.tracking)}
          ${metricBar('Reaction', lastAnalysis.metrics.reaction)}
          ${metricBar('Consistency', lastAnalysis.metrics.consistency)}
          ${metricBar('Horizontal', lastAnalysis.metrics.horizontalControl)}
          ${metricBar('Vertical', lastAnalysis.metrics.verticalControl)}
        </div>
      </div>
      <div class="panel">
        <h3>Diagnostics</h3>
        <div class="diagnosis" style="margin-top:18px">
          ${lastAnalysis.weaknesses.length
            ? lastAnalysis.weaknesses.map((weakness) => `
              <div class="diagnosis-card">
                <div class="severity ${weakness.severity.toLowerCase()}">
                  ${weakness.severity} · ${weakness.confidence}% confidence
                </div>
                <h3 style="margin-top:8px">${weakness.name}</h3>
                <div class="muted small">${weakness.evidence}</div>
              </div>
            `).join('')
            : '<div class="subtle-note">No strong weakness crossed the diagnostic thresholds. Optimization will favor the broadest stable region.</div>'}
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h3>Directional profile</h3>
      <div class="grid grid-4" style="margin-top:16px">
        ${Object.entries(lastAnalysis.sector).map(([key, value]) => `
          <div class="subtle-note"><b>${key}</b><div class="metric-value" style="font-size:23px">${Math.round(value)}</div></div>
        `).join('')}
      </div>
      <h3 style="margin-top:26px">Performance by angular distance</h3>
      <div class="grid grid-5" style="margin-top:14px">
        ${Object.entries(lastAnalysis.distance).map(([key, value]) => `
          <div class="subtle-note"><b>${key}°</b><div class="metric-value" style="font-size:21px">${Math.round(value)}</div></div>
        `).join('')}
      </div>
    </div>

    <div class="button-row">
      <button class="btn primary" id="openResult">VIEW OPTIMIZED SETTINGS</button>
      <button class="btn ghost" id="moreTests">RUN MORE DIAGNOSTICS</button>
    </div>
  `;

  qs('#openResult').onclick = () => navigate('results');
  qs('#moreTests').onclick = () => navigate('tests');
};

function buildWhy(analysis, optimization) {
  if (analysis.primary?.id === 'overshoot') {
    return `Your test data showed ${analysis.primary.evidence} The optimizer increased the penalty on fast sensitivity regions while protecting your existing strengths. X moved from ${optimization.current.x.toFixed(2)} to ${optimization.recommended.x.toFixed(2)}.`;
  }

  if (analysis.metrics.verticalControl < analysis.metrics.horizontalControl - 8) {
    return `Vertical control scored ${analysis.metrics.verticalControl.toFixed(0)} versus ${analysis.metrics.horizontalControl.toFixed(0)} horizontally. Y is therefore optimized separately instead of forcing X = Y.`;
  }

  return `The strongest candidates formed a broad region rather than one isolated spike. The recommendation is centered inside that robust region, which measured ${optimization.stability}% stability.`;
}

routes.results = () => {
  if (!lastAnalysis) {
    const runs = state.lastRun?.runs || [];
    lastAnalysis = mergeAnalyses(runs.map(analyzeRun));
  }
  if (!lastAnalysis) {
    navigate('tests');
    return;
  }

  if (!lastOptimization) {
    lastOptimization = optimize(state.settings, lastAnalysis);
  }

  const recommendation = lastOptimization.recommended;
  const current = state.settings;

  app.innerHTML = `
    ${shell('Optimized sensitivity', 'A robust recommendation from the strongest performance region, not a single noisy peak.')}

    <div class="result-grid">
      <div class="panel">
        <div class="eyebrow">Your aim performs best around</div>
        <div class="result-number" style="margin-top:12px">
          ${recommendation.x.toFixed(2)} X<br>
          ${recommendation.y.toFixed(2)} Y
        </div>
        <div class="grid grid-2" style="margin-top:24px">
          <div><div class="metric-label">ADS</div><div class="metric-value" style="font-size:28px">${recommendation.ads.toFixed(1)}</div></div>
          <div><div class="metric-label">Scope</div><div class="metric-value" style="font-size:28px">${recommendation.scope.toFixed(1)}</div></div>
        </div>
        <div class="subtle-note" style="margin-top:22px">
          <b>Confidence ${lastOptimization.confidence}%</b><br>
          ${lastOptimization.stability}% sensitivity stability across the strongest candidate region.
        </div>
      </div>

      <div class="panel">
        <div class="metric-label">Why this direction</div>
        <div class="list" style="margin-top:10px">
          <div class="list-row"><span>Current X</span><b>${current.x.toFixed(2)}</b></div>
          <div class="list-row"><span>Recommended X</span><b>${recommendation.x.toFixed(2)}</b></div>
          <div class="list-row"><span>Current Y</span><b>${current.y.toFixed(2)}</b></div>
          <div class="list-row"><span>Recommended Y</span><b>${recommendation.y.toFixed(2)}</b></div>
          <div class="list-row"><span>Current ADS</span><b>${current.ads.toFixed(1)}</b></div>
          <div class="list-row"><span>Recommended ADS</span><b>${recommendation.ads.toFixed(1)}</b></div>
        </div>
        <div class="subtle-note" style="margin-top:18px">${buildWhy(lastAnalysis, lastOptimization)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel">
        <h3>Current aim profile</h3>
        <div class="bars" style="margin-top:18px">
          ${metricBar('Precision', lastAnalysis.metrics.precision)}
          ${metricBar('Flick Speed', lastAnalysis.metrics.flickSpeed)}
          ${metricBar('Tracking', lastAnalysis.metrics.tracking)}
          ${metricBar('Stopping', lastAnalysis.metrics.stoppingControl)}
          ${metricBar('Consistency', lastAnalysis.metrics.consistency)}
        </div>
        <div class="footer-note">These are measured browser-test metrics, not guaranteed Fortnite outcomes.</div>
      </div>
      <div class="panel">
        <h3>Why not higher / lower?</h3>
        <div class="list" style="margin-top:18px">
          <div class="list-row"><span>Higher sensitivity</span><b class="warning">speed ↑ · overshoot ↑</b></div>
          <div class="muted small">Higher candidates can increase target acquisition velocity, but the model penalizes overshoot when it grows faster than the speed benefit.</div>
          <div class="list-row" style="margin-top:12px"><span>Lower sensitivity</span><b class="warning">precision ↑ · speed ↓</b></div>
          <div class="muted small">Lower candidates can reduce movement magnitude, but the model penalizes slower large-angle target switching.</div>
        </div>
      </div>
    </div>

    <div class="button-row">
      <button class="btn primary" id="validate">TEST MY NEW SENSITIVITY</button>
      <button class="btn ghost" id="saveReport">EXPORT REPORT</button>
      <button class="btn ghost" id="printReport">PRINT REPORT</button>
      <button class="btn ghost" id="fullReport">DETAILED REPORT</button>
    </div>
  `;

  qs('#validate').onclick = () => startValidation();
  qs('#saveReport').onclick = exportReport;
  qs('#printReport').onclick = () => window.print();
  qs('#fullReport').onclick = () => navigate('report');
};

async function startValidation() {
  if (!lastOptimization) return;

  const originalSettings = { ...state.settings };
  const recommendation = lastOptimization.recommended;

  Object.assign(state.settings, {
    ...state.settings,
    x: recommendation.x,
    y: recommendation.y,
    ads: recommendation.ads,
    scope: recommendation.scope,
  });

  save(state);

  const validationTest = {
    ...TESTS.find((test) => test.id === 'micro'),
    duration: 30,
    targets: 22,
  };

  await runTest(validationTest, true);

  const validationRun = state.lastRun?.runs?.find(
    (run) => run.testId === validationTest.id,
  );

  const validationAnalysis = validationRun ? analyzeRun(validationRun) : null;

  state.validation = {
    recommended: validationAnalysis?.metrics || null,
    original: lastAnalysis?.metrics || null,
    at: nowIso(),
  };

  Object.assign(state.settings, originalSettings);
  save(state);
  navigate('validation');
}

routes.validation = () => {
  const validation = state.validation;
  if (!validation) {
    navigate('results');
    return;
  }

  const keys = [
    'precision',
    'flickSpeed',
    'tracking',
    'stoppingControl',
    'reaction',
    'consistency',
  ];

  app.innerHTML = `
    ${shell('Validation', 'Your optional retest is compared against the original baseline.')}
    <div class="panel">
      <div class="eyebrow">Observed retest</div>
      <h3 style="font-size:24px;margin-top:8px">This comparison uses real measured browser telemetry.</h3>
      <div class="grid grid-2" style="margin-top:20px">
        <div class="subtle-note">
          <b>Original session</b>
          <div class="bars" style="margin-top:12px">
            ${keys.map((key) => metricBar(labelize(key), validation.original?.[key] ?? 0)).join('')}
          </div>
        </div>
        <div class="subtle-note">
          <b>Recommended sensitivity retest</b>
          <div class="bars" style="margin-top:12px">
            ${keys.map((key) => metricBar(labelize(key), validation.recommended?.[key] ?? 0)).join('')}
          </div>
        </div>
      </div>
      <div class="button-row">
        <button class="btn primary" id="finishSession">SAVE RESULT</button>
        <button class="btn ghost" id="detail">VIEW REPORT</button>
      </div>
    </div>
  `;

  qs('#finishSession').onclick = () => saveSession();
  qs('#detail').onclick = () => navigate('report');
};

function labelize(key) {
  return {
    flickSpeed: 'Flick Speed',
    stoppingControl: 'Stopping',
    movementEfficiency: 'Efficiency',
  }[key] || key.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}

function saveSession() {
  if (!lastAnalysis || !lastOptimization) {
    toast('Run diagnostics before saving a result.');
    return;
  }

  const record = {
    id: uuid(),
    timestamp: nowIso(),
    current: { ...lastOptimization.current },
    recommended: { ...lastOptimization.recommended },
    confidence: lastOptimization.confidence,
    profile: { ...lastAnalysis.metrics },
    primary: lastAnalysis.primary,
    tests: state.lastRun?.completed || [],
    validation: state.validation || null,
  };

  state.history.unshift(record);
  state.history = state.history.slice(0, 50);
  state.model.sessions += 1;
  state.model.overshoot.push(lastAnalysis.primary?.id === 'overshoot' ? 1 : 0);
  state.model.preferred = record.recommended;
  save(state);

  toast('Session saved to local history.');
  navigate('history');
}

function exportReport() {
  const payload = {
    version: 2,
    timestamp: nowIso(),
    settings: state.settings,
    calibration: state.calibration || null,
    tests: state.lastRun || null,
    analysis: lastAnalysis,
    optimization: lastOptimization,
    validation: state.validation || null,
  };

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: 'application/json' },
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `aimfoundry-report-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast('Report exported as JSON.');
}

routes.report = () => {
  if (!lastAnalysis) {
    const runs = state.lastRun?.runs || [];
    lastAnalysis = mergeAnalyses(runs.map(analyzeRun));
  }

  if (!lastAnalysis) {
    app.innerHTML = `${shell('Detailed report')}<div class="empty">Run a diagnostic session first.</div>`;
    return;
  }

  if (!lastOptimization) {
    lastOptimization = optimize(state.settings, lastAnalysis);
  }

  const landscape = lastOptimization.landscape || [];
  const topScore = landscape.length ? landscape[0].score : 1;
  const lowScore = landscape.length ? landscape[landscape.length - 1].score : 0;
  const range = Math.max(0.001, topScore - lowScore);

  app.innerHTML = `
    ${shell('Detailed aim report', 'Telemetry-derived diagnostics, uncertainty, sensitivity landscape, and model reasoning.')}
    <div class="grid grid-2">
      <div class="panel">
        <h3>Confidence intervals</h3>
        <div class="list" style="margin-top:14px">
          <div class="list-row"><span>Model quality</span><b>${lastAnalysis.quality.toFixed(0)}%</b></div>
          <div class="list-row"><span>Acquisitions</span><b>${lastAnalysis.counts.acquisitions}</b></div>
          <div class="list-row"><span>Telemetry samples</span><b>${lastAnalysis.counts.telemetry}</b></div>
          <div class="list-row"><span>Optimizer stability</span><b>${lastOptimization.stability}%</b></div>
        </div>
      </div>
      <div class="panel">
        <h3>Optimizer weights</h3>
        <div class="bars" style="margin-top:16px">
          ${Object.entries(lastOptimization.weights).map(([key, value]) => metricBar(key, value * 100)).join('')}
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h3>Sensitivity landscape</h3>
      <div class="muted small" style="margin-bottom:14px">
        The displayed candidates are ranked by the optimizer's objective function.
      </div>
      <div class="heatmap">
        ${landscape.slice(0, 81).map((candidate, index) => {
          const intensity = clamp((candidate.score - lowScore) / range, 0.08, 0.95);
          return `
            <div class="heat"
                 style="background:rgba(119,167,255,${intensity})"
                 title="X ${candidate.x.toFixed(2)} · Y ${candidate.y.toFixed(2)} · ADS ${candidate.ads.toFixed(1)}">
              ${index === 0 ? '★' : index + 1}
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="panel" style="margin-top:16px">
      <h3>Raw run inventory</h3>
      <table class="table">
        <thead><tr><th>Test</th><th>Telemetry</th><th>Acquisitions</th><th>Avg FPS</th></tr></thead>
        <tbody>
          ${(state.lastRun?.runs || []).map((run) => `
            <tr>
              <td>${TESTS.find((test) => test.id === run.testId)?.name || run.testId}</td>
              <td>${run.telemetry.length}</td>
              <td>${run.telemetry.filter((item) => item.kind === 'acquisition').length}</td>
              <td>${run.frame?.avg?.toFixed(1) || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="subtle-note" style="margin-top:16px">
      <b>Important limitation:</b> this system measures browser pointer behavior and a mathematical
      camera proxy. It cannot guarantee identical Fortnite input scaling, frame pacing, rendering,
      or hardware latency. Treat the recommendation as a testable starting point.
    </div>
  `;
};

routes.dashboard = () => {
  app.innerHTML = `
    ${shell('Dashboard', 'Your latest session, current baseline, and optimization state.')}
    <div class="grid grid-4">
      <div class="panel"><div class="metric-label">Current X</div><div class="metric-value">${state.settings.x.toFixed(2)}</div></div>
      <div class="panel"><div class="metric-label">Current Y</div><div class="metric-value">${state.settings.y.toFixed(2)}</div></div>
      <div class="panel"><div class="metric-label">ADS</div><div class="metric-value">${state.settings.ads.toFixed(1)}</div></div>
      <div class="panel"><div class="metric-label">Saved sessions</div><div class="metric-value">${state.history.length}</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel">
        <div class="eyebrow">Latest profile</div>
        <h3 style="font-size:22px;margin-top:7px">
          ${lastAnalysis?.primary?.name || state.history[0]?.primary?.name || 'No diagnosis yet'}
        </h3>
        <div class="muted small" style="margin-top:8px">
          ${lastAnalysis?.primary?.evidence || 'Run the diagnostic battery to build a persistent aim profile.'}
        </div>
        <button class="btn primary" id="dashRun" style="margin-top:20px">RUN ANALYSIS</button>
      </div>
      <div class="panel">
        <div class="eyebrow">Persistent model</div>
        <div class="list" style="margin-top:10px">
          <div class="list-row"><span>Sessions</span><b>${state.model.sessions}</b></div>
          <div class="list-row"><span>Preferred X</span><b>${state.model.preferred.x?.toFixed(2) || '—'}</b></div>
          <div class="list-row"><span>Preferred Y</span><b>${state.model.preferred.y?.toFixed(2) || '—'}</b></div>
          <div class="list-row"><span>Historical weight</span><b>15–30%</b></div>
        </div>
      </div>
    </div>
  `;

  qs('#dashRun').onclick = () => navigate('setup');
};

routes.history = () => {
  app.innerHTML = `
    ${shell('History', 'Previous recommendations are saved locally in your browser.')}
    ${state.history.length ? `
      <div class="panel">
        <table class="table">
          <thead><tr><th>Date</th><th>Current</th><th>Recommended</th><th>Confidence</th><th>Primary weakness</th></tr></thead>
          <tbody>
            ${state.history.map((record) => `
              <tr>
                <td>${new Date(record.timestamp).toLocaleString()}</td>
                <td>${record.current.x.toFixed(2)} / ${record.current.y.toFixed(2)}</td>
                <td>${record.recommended?.x?.toFixed(2) || '—'} / ${record.recommended?.y?.toFixed(2) || '—'}</td>
                <td>${record.confidence || '—'}%</td>
                <td>${record.primary?.name || 'Balanced'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="button-row">
          <button class="btn ghost" id="clearHistory">CLEAR TEST HISTORY</button>
          <button class="btn primary" id="exportHistory">EXPORT CURRENT REPORT</button>
        </div>
      </div>
    ` : '<div class="empty">No saved sessions yet.</div>'}
  `;

  qs('#clearHistory')?.addEventListener('click', () => {
    if (!confirm('Clear all saved test history?')) return;
    state.history = [];
    save(state);
    render('history');
  });

  qs('#exportHistory')?.addEventListener('click', exportReport);
};

routes.settings = () => {
  app.innerHTML = `
    ${shell('Settings', 'Tune the trainer, optimizer bounds, visualization, and developer diagnostics.')}
    <div class="grid grid-2">
      <div class="panel">
        <h3>Trainer</h3>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>DEFAULT TARGET SIZE</label><input id="targetSize" type="number" value="${state.settings.targetSize}" min="6" max="80"></div>
          <div class="field"><label>TEST DURATION</label><input id="duration" type="number" value="${state.settings.duration}" min="10" max="120"></div>
          <div class="field"><label>DIFFICULTY</label><select id="difficulty"><option value="adaptive">adaptive</option><option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option></select></div>
          <div class="field"><label>CROSSHAIR</label><select id="crosshair"><option value="cross">cross</option><option value="dot">dot</option><option value="circle">circle</option></select></div>
          <div class="field"><label>REDUCED MOTION</label><select id="reduced"><option value="false">Off</option><option value="true">On</option></select></div>
          <div class="field"><label>AUDIO</label><select id="audio"><option value="true">On</option><option value="false">Off</option></select></div>
        </div>
      </div>
      <div class="panel">
        <h3>Advanced optimizer bounds</h3>
        <div class="form-grid" style="margin-top:16px">
          <div class="field"><label>X RANGE ±%</label><input id="bx" type="number" value="${state.settings.optimizerBounds.xPct}" min="10" max="80"></div>
          <div class="field"><label>Y RANGE ±%</label><input id="by" type="number" value="${state.settings.optimizerBounds.yPct}" min="10" max="80"></div>
          <div class="field"><label>ADS RANGE ±%</label><input id="ba" type="number" value="${state.settings.optimizerBounds.adsPct}" min="10" max="60"></div>
        </div>
        <div class="subtle-note" style="margin-top:18px">
          Wider bounds increase exploration. They do not guarantee a better result.
        </div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-top:16px">
      <div class="panel">
        <div style="display:flex;justify-content:space-between">
          <div><h3>Developer mode</h3><div class="muted small">Live telemetry internals are available during a test.</div></div>
          <button class="btn ghost" id="devToggle">OPEN DEV PANEL</button>
        </div>
      </div>
      <div class="panel">
        <h3>Data controls</h3>
        <div class="button-row" style="margin-top:14px"><button class="btn ghost" id="resetData">RESET ALL DATA</button></div>
      </div>
    </div>

    <div id="devPanel" class="panel hidden" style="margin-top:16px"></div>
    <div class="button-row"><button class="btn primary" id="saveSettings">SAVE SETTINGS</button></div>
  `;

  qs('#difficulty').value = state.settings.difficulty || 'adaptive';
  qs('#crosshair').value = state.settings.crosshair || 'cross';
  qs('#reduced').value = state.settings.reducedMotion ? 'true' : 'false';
  qs('#audio').value = state.settings.audio ? 'true' : 'false';

  qs('#saveSettings').onclick = () => {
    Object.assign(state.settings, {
      targetSize: safeNumber(qs('#targetSize').value, state.settings.targetSize),
      duration: safeNumber(qs('#duration').value, state.settings.duration),
      difficulty: qs('#difficulty').value,
      crosshair: qs('#crosshair').value,
      reducedMotion: qs('#reduced').value === 'true',
      audio: qs('#audio').value === 'true',
      optimizerBounds: {
        xPct: safeNumber(qs('#bx').value, state.settings.optimizerBounds.xPct),
        yPct: safeNumber(qs('#by').value, state.settings.optimizerBounds.yPct),
        adsPct: safeNumber(qs('#ba').value, state.settings.optimizerBounds.adsPct),
      },
    });
    save(state);
    toast('Settings saved.');
  };

  qs('#resetData').onclick = () => {
    if (!confirm('Reset settings, history, calibration, and sessions?')) return;
    const fresh = resetStore();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, fresh);
    lastAnalysis = null;
    lastOptimization = null;
    toast('Local data reset.');
    navigate('landing');
  };

  qs('#devToggle').onclick = () => {
    const panel = qs('#devPanel');
    panel.classList.toggle('hidden');
    const live = testRuntime;
    panel.innerHTML = `
      <div class="eyebrow">Developer panel</div>
      <div class="muted small" style="margin-top:8px">
        ${live ? `
          Test: ${live.test.name}<br>
          Targets: ${live.currentIndex} / ${live.scenario.length}<br>
          Telemetry: ${live.telemetry.length}<br>
          Yaw: ${live.camera.yaw.toFixed(3)}<br>
          Pitch: ${live.camera.pitch.toFixed(3)}<br>
          Pointer lock: ${live.pointerLocked ? 'yes' : 'no'}
        ` : 'Start a test to populate live internals here.'}
      </div>
    `;
  };
};

qs('#resumeBtn').onclick = () => {
  if (testRuntime) resumeTest(testRuntime);
};

qs('#restartTestBtn').onclick = () => {
  if (testRuntime) restartTest(testRuntime);
};

qs('#exitTestBtn').onclick = () => {
  if (testRuntime) exitTest(testRuntime);
};

window.addEventListener('hashchange', () => {
  render(location.hash.slice(1) || 'landing');
});

window.addEventListener('blur', () => {
  if (testRuntime?.active && !testRuntime.pausedAt) {
    togglePause(testRuntime, true);
  }
});

window.addEventListener('resize', () => {
  if (testRuntime?.active) renderer.resize();
});

render(location.hash.slice(1) || 'landing');

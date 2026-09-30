import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  ENROLL_GUIDE,
  computeRenderedGuide,
  evaluatePosition,
  evaluatePoseMatch,
  sourceNormalizedBoxToRenderedBox,
  computeObjectCoverTransform,
  userPoseTargetFromYawRatio,
  updateReadiness,
  createInitialReadiness,
  type EnrollFaceInput,
  type EnrollPoseTarget,
} from './enrollment-guide';
import {
  canStartAutomaticCapture,
  canCaptureManually,
  rememberRecentValidFrame,
  selectBestValidFrame,
  submitEnrollmentSample,
  tryAcquireCaptureRequest,
  type ManualCaptureConditions,
  type RecentEnrollmentFrame,
} from './enrollment-capture';

const defaultViewport = { videoW: 1280, videoH: 720, renderW: 800, renderH: 450, mirrored: true };

const readyManualConditions: ManualCaptureConditions = {
  cameraActive: true,
  videoFrameReady: true,
  requestInFlight: false,
  enrollmentComplete: false,
  drawerOpen: true,
  drawerClosing: false,
  mounted: true,
  sessionPrepared: true,
  completing: false,
  studentAvailable: true,
};

function goodBox(overX = 0.0, overY = 0.0, wFactor = 0.78, hFactor = 0.78): { x: number; y: number; width: number; height: number } {
  const g = computeRenderedGuide();
  const gw = g.widthPct / 100;
  const gh = g.heightPct / 100;
  const gx = 0.5;
  const gy = 0.5;
  const fW = gw * wFactor;
  const fH = gh * hFactor;
  return {
    x: gx - fW / 2 + overX,
    y: gy - fH / 2 + overY,
    width: fW,
    height: fH,
  };
}

function makeInput(overrides: Partial<EnrollFaceInput> = {}): EnrollFaceInput {
  const base: EnrollFaceInput = {
    faceCount: 1,
    faceBox: goodBox(),
    assessmentAcceptable: true,
    assessmentGood: true,
    errorCode: null,
    poseLabel: 'FRONT',
    poseYawRatio: 0.5,
    poseRollDeg: 2,
    viewport: defaultViewport,
  };
  return { ...base, ...overrides };
}

describe('ENROLL_GUIDE geometry (SoT)', () => {
  test('width/height proportions match spec 35-45% / 55-70%', () => {
    assert.ok(ENROLL_GUIDE.widthRatio >= 0.35 && ENROLL_GUIDE.widthRatio <= 0.45, `width=${ENROLL_GUIDE.widthRatio}`);
    assert.ok(ENROLL_GUIDE.heightRatio >= 0.55 && ENROLL_GUIDE.heightRatio <= 0.70, `height=${ENROLL_GUIDE.heightRatio}`);
    const aspect = ENROLL_GUIDE.widthRatio / ENROLL_GUIDE.heightRatio;
    assert.ok(aspect >= 0.70 && aspect <= 0.82, `aspect=${aspect}`);
  });
  test('computeRenderedGuide returns centered box matching constants', () => {
    const r = computeRenderedGuide();
    assert.equal(Math.round(r.widthPct), Math.round(ENROLL_GUIDE.widthRatio * 100));
    assert.equal(Math.round(r.heightPct), Math.round(ENROLL_GUIDE.heightRatio * 100));
    assert.equal(r.leftPct + r.widthPct / 2, 50);
    assert.equal(r.topPct + r.heightPct / 2, 50);
  });
});

describe('evaluatePosition gating', () => {
  test('no face -> NO_FACE no auto capture', () => {
    const r = evaluatePosition(makeInput({ faceCount: 0, faceBox: null }));
    assert.equal(r.code, 'NO_FACE');
    assert.equal(r.autoCaptureCandidate, false);
  });
  test('multiple faces -> MULTIPLE_FACES no auto capture', () => {
    const r = evaluatePosition(makeInput({ faceCount: 2 }));
    assert.equal(r.code, 'MULTIPLE_FACES');
    assert.equal(r.autoCaptureCandidate, false);
  });
  test('invalid x -> shift instruction + no capture', () => {
    const tooLeft = { ...goodBox(), x: 0.02, width: 0.3 };
    const r = evaluatePosition(makeInput({ faceBox: tooLeft }));
    assert.equal(r.positionValid, false);
    assert.equal(r.autoCaptureCandidate, false);
    assert.ok(['SHIFT_LEFT', 'SHIFT_RIGHT'].includes(r.code));
  });
  test('FACE_TOO_SMALL -> quality invalid before position', () => {
    const r = evaluatePosition(makeInput({ errorCode: 'FACE_TOO_SMALL' }));
    assert.equal(r.qualityValid, false);
    assert.equal(r.code, 'TOO_FAR');
  });
  test('FACE_TOO_BLURRY -> BLURRY, invalid', () => {
    const r = evaluatePosition(makeInput({ errorCode: 'FACE_TOO_BLURRY' }));
    assert.equal(r.code, 'BLURRY');
    assert.equal(r.qualityValid, false);
    assert.equal(r.autoCaptureCandidate, false);
  });
});

describe('evaluatePosition VALID_POSING path', () => {
  test('position+quality+pose all good -> VALID_POSING candidate', () => {
    const r = evaluatePosition(makeInput());
    assert.equal(r.code, 'VALID_POSING');
    assert.equal(r.positionValid, true);
    assert.equal(r.qualityValid, true);
    assert.equal(r.poseValid, true);
    assert.equal(r.autoCaptureCandidate, true);
  });
  test('mirror true: face left on screen means user should move physical right (shift_right code)', () => {
    const leftShifted = goodBox(-0.14, 0, 0.78, 0.78);
    const r = evaluatePosition(makeInput({ faceBox: leftShifted, viewport: { ...defaultViewport, mirrored: true } }));
    assert.equal(r.mirrorAware, true);
    const shifted = ['SHIFT_LEFT', 'SHIFT_RIGHT', 'OUTSIDE_GUIDE'].includes(r.code);
    assert.ok(shifted, `expected SHIFT or OUTSIDE, got ${r.code}`);
    if (r.code === 'SHIFT_LEFT' || r.code === 'SHIFT_RIGHT') {
      assert.equal(r.code, 'SHIFT_RIGHT', 'on mirrored preview, face appearing too far left → user should physically shift right (into view center)');
    }
  });
  test('wrong pose SLIGHT_LEFT target while FRONT says WRONG_POSE', () => {
    const r = evaluatePosition(makeInput({ poseLabel: 'SLIGHT_LEFT' as EnrollPoseTarget, poseYawRatio: 0.5 }));
    assert.equal(r.poseValid, false);
    assert.ok(r.code === 'WRONG_POSE' || !r.autoCaptureCandidate);
  });
  test('assessmentAcceptable true but not good -> POSE_OK_BUT_QUALITY not candidate', () => {
    const r = evaluatePosition(makeInput({ assessmentGood: false }));
    assert.equal(r.code, 'POSE_OK_BUT_QUALITY');
    assert.equal(r.autoCaptureCandidate, false);
  });
  test('centered face inside the safe guide is accepted without rectangle-ellipse containment', () => {
    assert.equal(evaluatePosition(makeInput()).positionValid, true);
  });
  test('face too far and too close are rejected by size', () => {
    const guideWidth = computeRenderedGuide().widthPct / 100;
    const far = evaluatePosition(makeInput({ faceBox: { ...goodBox(), width: guideWidth * 0.45 } }));
    const close = evaluatePosition(makeInput({ faceBox: { ...goodBox(), width: guideWidth * 1.2 } }));
    assert.equal(far.code, 'TOO_FAR');
    assert.equal(close.code, 'TOO_CLOSE');
  });
  test('position hysteresis tolerates small movement after entering valid state', () => {
    const shiftedBox = goodBox(0.09);
    assert.equal(evaluatePosition(makeInput({ faceBox: shiftedBox })).positionValid, false);
    assert.equal(evaluatePosition(makeInput({ faceBox: shiftedBox, positionWasValid: true })).positionValid, true);
  });
});

describe('preview coordinate conversion', () => {
  test('object-cover transform includes crop offsets', () => {
    const transform = computeObjectCoverTransform(1280, 720, 640, 480);
    assert.equal(transform.scale, 2 / 3);
    assert.ok(Math.abs(transform.cropOffsetX - 106.6667) < 0.001);
    assert.equal(transform.cropOffsetY, 0);
  });
  test('source box maps through cover crop then mirror into display coordinates', () => {
    const viewport = { videoW: 1280, videoH: 720, renderW: 640, renderH: 480, mirrored: false };
    const rawBox = { x: 0.25, y: 0.25, width: 0.2, height: 0.4 };
    const unmirrored = sourceNormalizedBoxToRenderedBox(rawBox, viewport);
    assert.ok(Math.abs(unmirrored.x - 1 / 6) < 0.001);
    assert.equal(unmirrored.y, 0.25);
    assert.ok(Math.abs(unmirrored.width - 4 / 15) < 0.001);
    const mirrored = sourceNormalizedBoxToRenderedBox(rawBox, { ...viewport, mirrored: true });
    assert.ok(Math.abs(mirrored.x - (1 - unmirrored.x - unmirrored.width)) < 1e-9);
    assert.equal(mirrored.y, unmirrored.y);
  });
  test('yaw direction maps to user-left/right and preview mirroring does not invert pose', () => {
    assert.equal(userPoseTargetFromYawRatio(0.4), 'SLIGHT_LEFT');
    assert.equal(userPoseTargetFromYawRatio(0.6), 'SLIGHT_RIGHT');
    assert.equal(userPoseTargetFromYawRatio(0.5), 'FRONT');
    const left = makeInput({ poseLabel: 'SLIGHT_LEFT', poseYawRatio: 0.4 });
    assert.equal(evaluatePosition(left).poseValid, true);
    assert.equal(evaluatePosition({ ...left, viewport: { ...defaultViewport, mirrored: false } }).poseValid, true);
  });
});

describe('evaluatePoseMatch tolerances', () => {
  test('FRONT 0.5 ± tol passes', () => {
    const i = { poseLabel: 'FRONT' as EnrollPoseTarget, poseYawRatio: 0.5, poseRollDeg: 0, faceCount: 1, faceBox: goodBox(), assessmentAcceptable: true, assessmentGood: true, errorCode: null, viewport: defaultViewport };
    assert.ok(evaluatePoseMatch(i));
  });
  test('roll too large fails', () => {
    const i = { poseLabel: 'FRONT' as EnrollPoseTarget, poseYawRatio: 0.5, poseRollDeg: 35, faceCount: 1, faceBox: goodBox(), assessmentAcceptable: true, assessmentGood: true, errorCode: null, viewport: defaultViewport };
    assert.equal(evaluatePoseMatch(i), false);
  });
  test('front does not accept a turned pose and left/right targets stay directional', () => {
    const base = { faceCount: 1, faceBox: goodBox(), poseRollDeg: 0, assessmentAcceptable: true, assessmentGood: true, errorCode: null, viewport: defaultViewport };
    assert.equal(evaluatePoseMatch({ ...base, poseLabel: 'FRONT', poseYawRatio: 0.4 }), false);
    assert.equal(evaluatePoseMatch({ ...base, poseLabel: 'SLIGHT_LEFT', poseYawRatio: 0.4 }), true);
    assert.equal(evaluatePoseMatch({ ...base, poseLabel: 'SLIGHT_LEFT', poseYawRatio: 0.6 }), false);
    assert.equal(evaluatePoseMatch({ ...base, poseLabel: 'SLIGHT_RIGHT', poseYawRatio: 0.6 }), true);
  });
});

describe('readiness state machine (time-based + grace)', () => {
  test('continuous valid triggers exactly one capture after maxMs window', () => {
    let state = createInitialReadiness();
    const evalGood = evaluatePosition(makeInput());
    const start = 1_000;
    let captured = 0;
    let lastProgress = 0;
    let lastCaptureAt: number | null = null;
    for (let i = 0; i < 100; i++) {
      const { next, shouldCapture, stableProgress } = updateReadiness(state, evalGood, start + i * 20, lastCaptureAt);
      state = next;
      if (shouldCapture) {
        captured += 1;
        lastCaptureAt = start + i * 20;
      }
      if (stableProgress > lastProgress) lastProgress = stableProgress;
    }
    assert.equal(captured, 1, `captured=${captured}`);
    assert.ok(lastProgress > 0.7, 'progress ring built up');
    assert.equal(state.candidateStartedAtMs, null, 'successful readiness clears evidence for the next pose');
  });
  test('single-frame detector miss (graceMs) does NOT reset candidate', () => {
    const evalGood = evaluatePosition(makeInput());
    const evalBad = evaluatePosition(makeInput({ errorCode: 'FACE_TOO_BLURRY' }));
    let state = createInitialReadiness();
    const start = 10_000;
    const step = 50;
    let t = start;
    for (let i = 0; i < 4; i++, t += step) {
      const res = updateReadiness(state, evalGood, t);
      state = res.next;
    }
    assert.ok(state.candidateStartedAtMs !== null, 'candidate started');
    const started = state.candidateStartedAtMs;
    // single miss at 120ms gap, within grace (180)
    const miss = updateReadiness(state, evalBad, t);
    state = miss.next;
    assert.equal(state.candidateStartedAtMs, started, 'single miss preserved candidate via grace');
  });
  test('a short preview miss preserves the evidence window and capture fires once', () => {
    const good = evaluatePosition(makeInput());
    const miss = evaluatePosition(makeInput({ faceCount: 0, faceBox: null }));
    let state = createInitialReadiness();
    let captures = 0;
    for (const [time, observation] of [[0, good], [150, good], [300, miss], [430, good], [620, good]] as const) {
      const result = updateReadiness(state, observation, time);
      state = result.next;
      if (result.shouldCapture) captures += 1;
    }
    assert.equal(captures, 1);
  });
  test('two consecutive misses resets candidate', () => {
    const evalGood = evaluatePosition(makeInput());
    const evalBad = evaluatePosition(makeInput({ errorCode: 'FACE_TOO_BLURRY' }));
    let state = createInitialReadiness();
    let t = 0;
    for (let i = 0; i < 4; i++, t += 50) state = updateReadiness(state, evalGood, t).next;
    t += 50; state = updateReadiness(state, evalBad, t).next;
    t += 50; state = updateReadiness(state, evalBad, t).next;
    assert.equal(state.candidateStartedAtMs, null);
  });
  test('never produces shouldCapture when invalid forever', () => {
    const bad = evaluatePosition(makeInput({ faceCount: 0, faceBox: null }));
    let state = createInitialReadiness();
    let caps = 0;
    for (let i = 0; i < 200; i++) {
      const r = updateReadiness(state, bad, i * 10);
      state = r.next;
      if (r.shouldCapture) caps++;
    }
    assert.equal(caps, 0);
  });
});

describe('manual enrollment fallback', () => {
  test('auto readiness false does not disable manual capture', () => {
    const state = { ...readyManualConditions, autoReady: false };
    assert.equal(canCaptureManually(state), true);
  });
  test('preview timeout does not disable manual capture', () => {
    const state = { ...readyManualConditions, previewTimedOut: true };
    assert.equal(canCaptureManually(state), true);
  });
  test('in-flight request disables manual capture and prevents a second shared request', () => {
    const lock = { current: false };
    assert.equal(tryAcquireCaptureRequest(lock), true);
    assert.equal(canCaptureManually({ ...readyManualConditions, requestInFlight: lock.current }), false);
    assert.equal(tryAcquireCaptureRequest(lock), false);
  });
  test('inactive camera disables manual capture', () => {
    assert.equal(canCaptureManually({ ...readyManualConditions, cameraActive: false }), false);
  });
  test('camera without a decoded frame disables manual capture', () => {
    assert.equal(canCaptureManually({ ...readyManualConditions, videoFrameReady: false }), false);
  });
  test('accepted manual backend sample advances from returned backend count', async () => {
    let sampleCount = 0;
    await submitEnrollmentSample(
      async () => ({ sampleCount: 1, minimumSamples: 3 }),
      (result) => { sampleCount = result.sampleCount; },
    );
    assert.equal(sampleCount, 1);
  });
  test('rejected manual backend sample leaves progress unchanged', async () => {
    let sampleCount = 1;
    await assert.rejects(submitEnrollmentSample(
      async () => { throw new Error('Wajah terlalu jauh'); },
      (result: { sampleCount: number }) => { sampleCount = result.sampleCount; },
    ), /Wajah terlalu jauh/);
    assert.equal(sampleCount, 1);
  });
  test('completed enrollment disables manual capture', () => {
    assert.equal(canCaptureManually({ ...readyManualConditions, enrollmentComplete: true }), false);
  });
  test('auto capture is blocked when enrollment is complete or a request is active', () => {
    assert.equal(canStartAutomaticCapture({ ready: true, requestInFlight: false, cooldownActive: false, enrollmentComplete: true }), false);
    assert.equal(canStartAutomaticCapture({ ready: true, requestInFlight: true, cooldownActive: false, enrollmentComplete: false }), false);
    assert.equal(canStartAutomaticCapture({ ready: true, requestInFlight: false, cooldownActive: true, enrollmentComplete: false }), false);
    assert.equal(canStartAutomaticCapture({ ready: true, requestInFlight: false, cooldownActive: false, enrollmentComplete: false }), true);
  });
  test('auto-accepted sample progress uses the backend count', async () => {
    let sampleCount = 0;
    await submitEnrollmentSample(
      async () => ({ sampleCount: 2, minimumSamples: 3 }),
      (result) => { sampleCount = result.sampleCount; },
    );
    assert.equal(sampleCount, 2);
  });
  test('best valid frame is selected from a three-frame bound for the active pose', () => {
    let frames: RecentEnrollmentFrame<string>[] = [];
    frames = rememberRecentValidFrame(frames, { frame: 'frame-1', score: 4, pose: 'FRONT' });
    frames = rememberRecentValidFrame(frames, { frame: 'frame-2', score: 9, pose: 'FRONT' });
    frames = rememberRecentValidFrame(frames, { frame: 'frame-3', score: 7, pose: 'SLIGHT_LEFT' });
    frames = rememberRecentValidFrame(frames, { frame: 'frame-4', score: 10, pose: 'FRONT' });
    assert.equal(frames.length, 3);
    assert.equal(selectBestValidFrame(frames, 'FRONT')?.frame, 'frame-4');
    assert.equal(selectBestValidFrame(frames, 'SLIGHT_RIGHT'), null);
  });
});

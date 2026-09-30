export const ENROLL_GUIDE = {
  widthRatio: 0.44,
  heightRatio: 0.58,
  aspect: 0.44 / 0.58,
  xCenterTolerance: 0.075,
  yCenterTolerance: 0.085,
  xExitTolerance: 0.115,
  yExitTolerance: 0.13,
  sizeMinRel: 0.52,
  sizeMaxRel: 1.08,
  autoCaptureMinStableMs: 420,
  autoCaptureMaxStableMs: 620,
  singleMissGraceMs: 450,
  poseFrontMinYaw: 0.44,
  poseFrontMaxYaw: 0.56,
  poseVariationMinYaw: 0.35,
  poseVariationMaxYaw: 0.65,
  poseMatchRollToleranceDeg: 24,
} as const;

export type EnrollPoseTarget = 'FRONT' | 'SLIGHT_LEFT' | 'SLIGHT_RIGHT';

export interface EnrollFaceInput {
  faceCount: number;
  faceBox: null | { x: number; y: number; width: number; height: number };
  assessmentAcceptable: boolean;
  assessmentGood: boolean;
  errorCode: string | null;
  poseLabel: EnrollPoseTarget;
  poseYawRatio: number;
  poseRollDeg: number;
  positionWasValid?: boolean;
  viewport: { videoW: number; videoH: number; renderW: number; renderH: number; mirrored: boolean };
}

export type EnrollPositionCode =
  | 'NO_FACE'
  | 'MULTIPLE_FACES'
  | 'TOO_FAR'
  | 'TOO_CLOSE'
  | 'SHIFT_LEFT'
  | 'SHIFT_RIGHT'
  | 'SHIFT_DOWN'
  | 'SHIFT_UP'
  | 'OUTSIDE_GUIDE'
  | 'BLURRY'
  | 'TOO_DARK'
  | 'TOO_BRIGHT'
  | 'BAD_POSE'
  | 'LOW_QUALITY'
  | 'WRONG_POSE'
  | 'POSE_OK_BUT_QUALITY'
  | 'VALID_POSING'
  | 'READY';

export interface EnrollEvaluation {
  code: EnrollPositionCode;
  message: string;
  positionValid: boolean;
  qualityValid: boolean;
  poseValid: boolean;
  guideValid: boolean;
  autoCaptureCandidate: boolean;
  mirrorAware: boolean;
}

export interface EnrollReadinessState {
  candidateStartedAtMs: number | null;
  lastValidObservedAtMs: number | null;
  lastMissAtMs: number | null;
  consecutiveMisses: number;
}

export type EnrollPoseSequence = Array<EnrollPoseTarget>;

export const ENROLL_POSE_SEQUENCE: EnrollPoseSequence = ['FRONT', 'SLIGHT_LEFT', 'SLIGHT_RIGHT'];

export const POSE_TARGET_LABELS: Record<EnrollPoseTarget, string> = {
  FRONT: 'Hadap lurus',
  SLIGHT_LEFT: 'Putar sedikit ke kiri',
  SLIGHT_RIGHT: 'Putar sedikit ke kanan',
};

const QUALITY_CODE_TO_MESSAGE: Record<string, { code: EnrollPositionCode; message: string }> = {
  FACE_TOO_BLURRY: { code: 'BLURRY', message: 'Tahan sebentar — gambar kurang tajam' },
  FACE_TOO_DARK: { code: 'TOO_DARK', message: 'Pindah ke area yang lebih terang' },
  FACE_TOO_BRIGHT: { code: 'TOO_BRIGHT', message: 'Kurangi cahaya langsung pada wajah' },
  FACE_BAD_POSE: { code: 'BAD_POSE', message: 'Hadapkan wajah lurus ke kamera' },
  FACE_LOW_CONFIDENCE: { code: 'LOW_QUALITY', message: 'Posisikan wajah lebih jelas' },
  FACE_OUT_OF_FRAME: { code: 'OUTSIDE_GUIDE', message: 'Posisikan seluruh wajah di dalam area' },
  FACE_TOO_SMALL: { code: 'TOO_FAR', message: 'Dekatkan wajah sedikit' },
};

export function createInitialReadiness(): EnrollReadinessState {
  return {
    candidateStartedAtMs: null,
    lastValidObservedAtMs: null,
    lastMissAtMs: null,
    consecutiveMisses: 0,
  };
}

export interface EnrollRenderedBox {
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

export interface ObjectCoverTransform {
  scale: number;
  displayedWidth: number;
  displayedHeight: number;
  cropOffsetX: number;
  cropOffsetY: number;
}

export function computeObjectCoverTransform(
  sourceWidth: number,
  sourceHeight: number,
  renderedWidth: number,
  renderedHeight: number,
): ObjectCoverTransform {
  const scale = Math.max(renderedWidth / sourceWidth, renderedHeight / sourceHeight);
  const displayedWidth = sourceWidth * scale;
  const displayedHeight = sourceHeight * scale;
  return {
    scale,
    displayedWidth,
    displayedHeight,
    cropOffsetX: (displayedWidth - renderedWidth) / 2,
    cropOffsetY: (displayedHeight - renderedHeight) / 2,
  };
}

export function sourceNormalizedBoxToRenderedBox(
  box: { x: number; y: number; width: number; height: number },
  viewport: { videoW: number; videoH: number; renderW: number; renderH: number; mirrored: boolean },
): { x: number; y: number; width: number; height: number } {
  const transform = computeObjectCoverTransform(
    viewport.videoW,
    viewport.videoH,
    viewport.renderW,
    viewport.renderH,
  );
  const renderedBox = {
    x: (box.x * viewport.videoW * transform.scale - transform.cropOffsetX) / viewport.renderW,
    y: (box.y * viewport.videoH * transform.scale - transform.cropOffsetY) / viewport.renderH,
    width: (box.width * viewport.videoW * transform.scale) / viewport.renderW,
    height: (box.height * viewport.videoH * transform.scale) / viewport.renderH,
  };
  return viewport.mirrored
    ? { ...renderedBox, x: 1 - renderedBox.x - renderedBox.width }
    : renderedBox;
}

export function userPoseTargetFromYawRatio(yawRatio: number): EnrollPoseTarget {
  if (yawRatio < ENROLL_GUIDE.poseFrontMinYaw) return 'SLIGHT_LEFT';
  if (yawRatio > ENROLL_GUIDE.poseFrontMaxYaw) return 'SLIGHT_RIGHT';
  return 'FRONT';
}

export function computeRenderedGuide(): EnrollRenderedBox {
  const widthPct = ENROLL_GUIDE.widthRatio * 100;
  const heightPct = ENROLL_GUIDE.heightRatio * 100;
  const leftPct = (1 - ENROLL_GUIDE.widthRatio) / 2 * 100;
  const topPct = (1 - ENROLL_GUIDE.heightRatio) / 2 * 100;
  return { leftPct, topPct, widthPct, heightPct };
}

export function evaluatePosition(input: EnrollFaceInput): EnrollEvaluation {
  if (input.faceCount === 0 || !input.faceBox) {
    return {
      code: 'NO_FACE',
      message: 'Posisikan wajah di area',
      positionValid: false,
      qualityValid: false,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (input.faceCount > 1) {
    return {
      code: 'MULTIPLE_FACES',
      message: 'Pastikan hanya satu orang di depan kamera',
      positionValid: false,
      qualityValid: false,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  const fb = input.faceBox;
  const fx = fb.x + fb.width / 2;
  const fy = fb.y + fb.height / 2;
  const guide = computeRenderedGuide();
  const gx = (guide.leftPct + guide.widthPct / 2) / 100;
  const gy = (guide.topPct + guide.heightPct / 2) / 100;
  const gw = guide.widthPct / 100;
  const gh = guide.heightPct / 100;
  const sizeMin = gw * ENROLL_GUIDE.sizeMinRel;
  const sizeMax = gw * ENROLL_GUIDE.sizeMaxRel;

  if (input.errorCode && QUALITY_CODE_TO_MESSAGE[input.errorCode]) {
    const q = QUALITY_CODE_TO_MESSAGE[input.errorCode];
    return {
      code: q.code,
      message: q.message,
      positionValid: q.code === 'TOO_FAR' ? false : false,
      qualityValid: false,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }

  if (fb.width < sizeMin) {
    return {
      code: 'TOO_FAR',
      message: 'Dekatkan wajah sedikit',
      positionValid: false,
      qualityValid: input.assessmentAcceptable,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (fb.width > sizeMax) {
    return {
      code: 'TOO_CLOSE',
      message: 'Mundurkan sedikit',
      positionValid: false,
      qualityValid: input.assessmentAcceptable,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }

  const tolX = input.positionWasValid ? ENROLL_GUIDE.xExitTolerance : ENROLL_GUIDE.xCenterTolerance;
  const tolY = input.positionWasValid ? ENROLL_GUIDE.yExitTolerance : ENROLL_GUIDE.yCenterTolerance;
  const dx = fx - gx;
  const dy = fy - gy;

  const isMirrored = input.viewport.mirrored;
  const leftPhysically = dx < -tolX;
  const rightPhysically = dx > tolX;
  let horiz: EnrollPositionCode | null = null;
  let horizMsg = '';
  if (leftPhysically) {
    if (isMirrored) {
      horiz = 'SHIFT_RIGHT';
      horizMsg = 'Geser sedikit ke kanan';
    } else {
      horiz = 'SHIFT_LEFT';
      horizMsg = 'Geser sedikit ke kiri';
    }
  } else if (rightPhysically) {
    if (isMirrored) {
      horiz = 'SHIFT_LEFT';
      horizMsg = 'Geser sedikit ke kiri';
    } else {
      horiz = 'SHIFT_RIGHT';
      horizMsg = 'Geser sedikit ke kanan';
    }
  }
  if (horiz) {
    return {
      code: horiz,
      message: horizMsg,
      positionValid: false,
      qualityValid: input.assessmentAcceptable,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (dy < -tolY) {
    return {
      code: 'SHIFT_DOWN',
      message: 'Turunkan wajah sedikit',
      positionValid: false,
      qualityValid: input.assessmentAcceptable,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (dy > tolY) {
    return {
      code: 'SHIFT_UP',
      message: 'Naikkan wajah sedikit',
      positionValid: false,
      qualityValid: input.assessmentAcceptable,
      poseValid: false,
      guideValid: false,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }

  const poseValid = evaluatePoseMatch(input);
  const qualityValid = input.assessmentAcceptable;

  if (!qualityValid) {
    return {
      code: 'LOW_QUALITY',
      message: 'Pastikan wajah terlihat jelas',
      positionValid: true,
      qualityValid: false,
      poseValid,
      guideValid: true,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (!poseValid) {
    return {
      code: 'WRONG_POSE',
      message: input.assessmentGood ? 'Ikuti arahan pose yang diminta' : 'Pastikan pose sesuai & wajah jelas',
      positionValid: true,
      qualityValid: true,
      poseValid: false,
      guideValid: true,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  if (!input.assessmentGood) {
    return {
      code: 'POSE_OK_BUT_QUALITY',
      message: 'Posisi bagus, tingkatkan sedikit kualitas (hindari blur)',
      positionValid: true,
      qualityValid: true,
      poseValid: true,
      guideValid: true,
      autoCaptureCandidate: false,
      mirrorAware: true,
    };
  }
  return {
    code: 'VALID_POSING',
    message: 'Posisi bagus, tahan sebentar',
    positionValid: true,
    qualityValid: true,
    poseValid: true,
    guideValid: true,
    autoCaptureCandidate: true,
    mirrorAware: true,
  };
}

export function evaluatePoseMatch(input: EnrollFaceInput): boolean {
  const yaw = input.poseYawRatio;
  const roll = Math.abs(input.poseRollDeg);
  if (roll > ENROLL_GUIDE.poseMatchRollToleranceDeg) return false;
  switch (input.poseLabel) {
    case 'FRONT':
      return yaw >= ENROLL_GUIDE.poseFrontMinYaw && yaw <= ENROLL_GUIDE.poseFrontMaxYaw;
    case 'SLIGHT_LEFT':
      return yaw < ENROLL_GUIDE.poseFrontMinYaw && yaw >= ENROLL_GUIDE.poseVariationMinYaw;
    case 'SLIGHT_RIGHT':
      return yaw > ENROLL_GUIDE.poseFrontMaxYaw && yaw <= ENROLL_GUIDE.poseVariationMaxYaw;
  }
}

export function updateReadiness(
  state: EnrollReadinessState,
  evalNow: EnrollEvaluation,
  nowMs: number,
  lastCaptureAtMs: number | null = null,
  captureCooldownMs: number = 1500,
): { next: EnrollReadinessState; shouldCapture: boolean; stableProgress: number } {
  if (lastCaptureAtMs !== null && nowMs - lastCaptureAtMs < captureCooldownMs) {
    return { next: { ...createInitialReadiness(), lastMissAtMs: state.lastMissAtMs, lastValidObservedAtMs: state.lastValidObservedAtMs }, shouldCapture: false, stableProgress: 0 };
  }
  let next: EnrollReadinessState = { ...state };
  let shouldCapture = false;
  let stableProgress = 0;
  if (!evalNow.autoCaptureCandidate) {
    next.consecutiveMisses = state.consecutiveMisses + 1;
    next.lastMissAtMs = nowMs;
    if (state.candidateStartedAtMs !== null) {
      const grace = ENROLL_GUIDE.singleMissGraceMs;
      const sinceLastValid = state.lastValidObservedAtMs == null ? grace + 1 : nowMs - state.lastValidObservedAtMs;
      const tooManyMisses = next.consecutiveMisses > 1;
      if (sinceLastValid > grace || tooManyMisses) {
        next.candidateStartedAtMs = null;
        next.lastValidObservedAtMs = null;
        next.consecutiveMisses = 0;
      }
    }
  } else {
    next.lastMissAtMs = null;
    next.consecutiveMisses = 0;
    next.lastValidObservedAtMs = nowMs;
    if (state.candidateStartedAtMs === null) {
      next.candidateStartedAtMs = nowMs;
    }
    const started = next.candidateStartedAtMs;
    if (started === null) {
      next.candidateStartedAtMs = nowMs;
    }
    const elapsed = nowMs - (started ?? nowMs);
    const minMs = ENROLL_GUIDE.autoCaptureMinStableMs;
    const maxMs = ENROLL_GUIDE.autoCaptureMaxStableMs;
    if (elapsed >= maxMs) {
      shouldCapture = true;
      next = createInitialReadiness();
    } else if (elapsed >= minMs) {
      stableProgress = Math.min(1, (elapsed - minMs) / (maxMs - minMs));
    }
  }
  if (next.candidateStartedAtMs !== null) {
    const elapsed = nowMs - next.candidateStartedAtMs;
    const minMs = ENROLL_GUIDE.autoCaptureMinStableMs;
    const maxMs = ENROLL_GUIDE.autoCaptureMaxStableMs;
    if (elapsed < minMs) {
      stableProgress = Math.max(stableProgress, (elapsed / minMs) * 0.75);
    } else {
      stableProgress = Math.max(stableProgress, 0.75 + Math.min(0.25, ((elapsed - minMs) / (maxMs - minMs)) * 0.25));
    }
  }
  return { next, shouldCapture, stableProgress };
}

export interface ManualCaptureConditions {
  cameraActive: boolean;
  videoFrameReady: boolean;
  requestInFlight: boolean;
  enrollmentComplete: boolean;
  drawerOpen: boolean;
  drawerClosing: boolean;
  mounted: boolean;
  sessionPrepared: boolean;
  completing: boolean;
  studentAvailable: boolean;
}

export interface RecentEnrollmentFrame<T> {
  frame: T;
  score: number;
  pose: string;
}

export function rememberRecentValidFrame<T>(
  frames: RecentEnrollmentFrame<T>[],
  nextFrame: RecentEnrollmentFrame<T>,
  maximumFrames = 3,
): RecentEnrollmentFrame<T>[] {
  return [...frames, nextFrame].slice(-maximumFrames);
}

export function selectBestValidFrame<T>(
  frames: RecentEnrollmentFrame<T>[],
  pose: string,
): RecentEnrollmentFrame<T> | null {
  return frames.filter((candidate) => candidate.pose === pose)
    .reduce<RecentEnrollmentFrame<T> | null>((best, candidate) =>
      !best || candidate.score > best.score ? candidate : best, null);
}

export function canStartAutomaticCapture(conditions: {
  ready: boolean;
  requestInFlight: boolean;
  cooldownActive: boolean;
  enrollmentComplete: boolean;
}): boolean {
  return conditions.ready && !conditions.requestInFlight &&
    !conditions.cooldownActive && !conditions.enrollmentComplete;
}

export function canCaptureManually(conditions: ManualCaptureConditions): boolean {
  return conditions.cameraActive &&
    conditions.videoFrameReady &&
    !conditions.requestInFlight &&
    !conditions.enrollmentComplete &&
    conditions.drawerOpen &&
    !conditions.drawerClosing &&
    conditions.mounted &&
    conditions.sessionPrepared &&
    !conditions.completing &&
    conditions.studentAvailable;
}

export function tryAcquireCaptureRequest(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export async function submitEnrollmentSample<T>(
  request: () => Promise<T>,
  onAccepted: (result: T) => void,
): Promise<T> {
  const result = await request();
  onAccepted(result);
  return result;
}
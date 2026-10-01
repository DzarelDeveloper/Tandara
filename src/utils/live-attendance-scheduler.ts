export interface ScanScheduleConfig {
  targetPeriodMs: number;
  minimumIdleMs: number;
}

export function nextScanDelayMs(processingMs: number, config: ScanScheduleConfig): number {
  const processing = Number.isFinite(processingMs) ? Math.max(0, processingMs) : 0;
  return Math.max(config.minimumIdleMs, config.targetPeriodMs - processing);
}

export function scanRatePerSecond(startToStartMs: number): number {
  return startToStartMs > 0 ? 1000 / startToStartMs : 0;
}

export function tryAcquireScanLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function nextVisualVerificationState(
  wasVerifying: boolean,
  hasCandidateEvidence: boolean,
  missedFrames: number,
  toleratedMisses = 1,
): { verifying: boolean; missedFrames: number } {
  if (hasCandidateEvidence) return { verifying: true, missedFrames: 0 };
  if (wasVerifying && missedFrames < toleratedMisses) {
    return { verifying: true, missedFrames: missedFrames + 1 };
  }
  return { verifying: false, missedFrames: 0 };
}
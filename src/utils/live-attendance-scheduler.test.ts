import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { nextScanDelayMs, nextVisualVerificationState, scanRatePerSecond, tryAcquireScanLock } from './live-attendance-scheduler';

const config = { targetPeriodMs: 400, minimumIdleMs: 60 };

describe('live attendance start-to-start scheduler', () => {
  test('subtracts elapsed processing from target period', () => {
    assert.equal(nextScanDelayMs(320, config), 80);
  });

  test('uses only minimum idle delay when processing exceeds target', () => {
    assert.equal(nextScanDelayMs(500, config), 60);
  });

  test('does not add request latency a second time', () => {
    const requestMs = 500;
    const nextDelay = nextScanDelayMs(requestMs, config);
    assert.equal(requestMs + nextDelay, 560);
    assert.ok(requestMs + nextDelay < requestMs * 2);
  });

  test('reports measured start-to-start scan rate', () => {
    assert.equal(scanRatePerSecond(400), 2.5);
  });

  test('synchronous in-flight lock prevents overlapping scans', () => {
    const lock = { current: false };
    assert.equal(tryAcquireScanLock(lock), true);
    assert.equal(tryAcquireScanLock(lock), false);
    lock.current = false;
    assert.equal(tryAcquireScanLock(lock), true);
  });

  test('visual verifying state survives one miss but not repeated misses', () => {
    const firstMiss = nextVisualVerificationState(true, false, 0);
    assert.deepEqual(firstMiss, { verifying: true, missedFrames: 1 });
    assert.deepEqual(nextVisualVerificationState(true, true, firstMiss.missedFrames), { verifying: true, missedFrames: 0 });
    assert.deepEqual(nextVisualVerificationState(true, false, firstMiss.missedFrames), { verifying: false, missedFrames: 0 });
  });
});
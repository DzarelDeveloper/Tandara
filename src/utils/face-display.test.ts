import assert from 'node:assert/strict';
import test from 'node:test';
import { faceLabel } from './face-display';

test('verified identity still requires liveness in normal UI', () => {
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'LIVENESS_PENDING' }), 'Perlu verifikasi');
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'SPOOF_SUSPECTED' }), 'Ditolak');
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'LIVE' }), 'Terverifikasi');
  assert.equal(faceLabel({ state: 'UNKNOWN', liveness: 'LIVE' }), 'Tidak dikenal');
  assert.equal(faceLabel({ state: 'VERIFYING', liveness: 'LIVE' }), 'Memverifikasi...');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { faceLabel } from './face-display';

test('camera labels keep recognition, verification, and liveness distinct', () => {
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'LIVENESS_PENDING', recognitionStatus: 'RECOGNIZED', status: 'LIVENESS_PENDING' }), 'Menunggu liveness');
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'SPOOF_SUSPECTED', recognitionStatus: 'RECOGNIZED', status: 'SPOOF_SUSPECTED' }), 'Ditolak');
  assert.equal(faceLabel({ state: 'VERIFIED', liveness: 'LIVE', recognitionStatus: 'RECOGNIZED', status: 'RECOGNIZED' }), 'LIVE');
  assert.equal(faceLabel({ state: 'UNKNOWN', liveness: 'LIVE', recognitionStatus: 'UNKNOWN_FACE', status: 'UNKNOWN_FACE' }), 'Tidak dikenal');
  assert.equal(faceLabel({ state: 'VERIFYING', liveness: 'LIVENESS_PENDING', recognitionStatus: 'RECOGNIZED', status: 'VERIFYING' }), 'Verifikasi identitas');
  assert.equal(faceLabel({ state: 'TRACKING', liveness: 'LIVENESS_PENDING', recognitionStatus: 'FACE_TOO_SMALL', status: 'FACE_TOO_SMALL' }), 'Perbaiki posisi wajah');
});

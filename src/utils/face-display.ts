import type { TrackedFace } from '../services/attendance.service';

export function faceLabel(face: Pick<TrackedFace, 'state' | 'liveness'>): string {
  if (face.state === 'UNKNOWN') return 'Tidak dikenal';
  if (face.liveness === 'SPOOF_SUSPECTED') return 'Ditolak';
  if (face.state === 'VERIFIED' || face.state === 'ATTENDED') {
    return face.liveness === 'LIVE' ? 'Terverifikasi' : 'Perlu verifikasi';
  }
  return 'Memverifikasi...';
}

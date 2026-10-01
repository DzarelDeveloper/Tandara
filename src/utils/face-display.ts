import type { TrackedFace } from '../services/attendance.service';

export function faceLabel(face: Pick<TrackedFace, 'state' | 'liveness'> & Partial<Pick<TrackedFace, 'recognitionStatus' | 'status'>>): string {
  if (face.liveness === 'SPOOF_SUSPECTED' || face.status === 'SPOOF_SUSPECTED') return 'Ditolak';
  if (face.recognitionStatus === 'FACE_NOT_DETECTED') return 'Wajah tidak terdeteksi';
  if (face.recognitionStatus?.startsWith('FACE_')) return face.status === 'TRACKING' ? 'Terdeteksi' : 'Perbaiki posisi wajah';
  if (face.state === 'UNKNOWN' || face.recognitionStatus === 'UNKNOWN_FACE') return 'Tidak dikenal';
  if (face.state === 'TRACKING') return 'Terdeteksi';
  if (face.state === 'VERIFYING') return 'Verifikasi identitas';
  if (face.liveness === 'LIVENESS_PENDING') return 'Menunggu liveness';
  if (face.liveness === 'LIVE') return 'LIVE';
  return 'Terverifikasi';
}

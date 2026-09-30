export const CAMERA_STORAGE_KEY = 'tandara_camera_device_id';

export const CAMERA_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 20, max: 24 },
};

export function cameraConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...CAMERA_VIDEO_CONSTRAINTS,
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  };
}
export async function enumerateVideoDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export type CameraPermissionState = 'NOT_REQUESTED' | 'REQUESTING' | 'GRANTED' | 'DENIED' | 'NO_DEVICE' | 'DEVICE_BUSY' | 'ERROR';

export function cameraErrorState(error: unknown): Exclude<CameraPermissionState, 'NOT_REQUESTED' | 'REQUESTING' | 'GRANTED'> {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'DENIED';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'NO_DEVICE';
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'DEVICE_BUSY';
  return 'ERROR';
}

export function cameraErrorMessage(state: CameraPermissionState): string {
  if (state === 'DENIED') return 'Izin kamera ditolak. Aktifkan izin kamera pada browser.';
  if (state === 'NO_DEVICE') return 'Tidak ada perangkat kamera yang terdeteksi.';
  if (state === 'DEVICE_BUSY') return 'Kamera sedang digunakan aplikasi lain atau tidak dapat dibuka.';
  if (state === 'REQUESTING') return 'Menunggu izin kamera browser…';
  if (state === 'GRANTED') return 'Izin kamera diberikan.';
  if (state === 'ERROR') return 'Kamera tidak dapat diakses. Periksa perangkat dan browser.';
  return 'Kamera membutuhkan izin browser.';
}

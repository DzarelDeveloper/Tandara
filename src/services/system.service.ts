import { apiRequest } from './api';

export interface HealthStatus {
  status: string;
  database: { status: 'connected' | 'error'; type: string };
  face_recognition: 'READY' | 'NOT_CONFIGURED' | 'ERROR';
}

export interface FaceEngineHealth {
  status: 'READY' | 'NOT_CONFIGURED' | 'ERROR';
  detector: string;
  detectorStatus: string;
  recognizer: string;
  recognizerStatus: string;
  engine: string;
  message?: string | null;
}

export interface ActiveSessionHealth {
  id: string;
  mode: 'CHECK_IN' | 'CHECK_OUT';
  status: string;
  cameraSource: string;
  openedAt: string;
}

export interface DetectionDiagnostic {
  faceCount: number;
  quality: string;
  faceBoxes: Array<{ x: number; y: number; width: number; height: number }>;
}

export const systemService = {
  health: () => apiRequest<HealthStatus>('/api/health'),
  faceEngine: () => apiRequest<FaceEngineHealth>('/api/face-engine/status'),
  activeSession: () => apiRequest<ActiveSessionHealth | null>('/api/attendance-sessions/active'),
  detectFace: (image: Blob, signal?: AbortSignal) => {
    const body = new FormData();
    body.append('image', image, 'diagnostic.jpg');
    return apiRequest<DetectionDiagnostic>('/api/face-engine/detect', { method: 'POST', body, signal });
  },
};

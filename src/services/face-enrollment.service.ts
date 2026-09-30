import { apiRequest, ApiError } from './api';
import type { EnrollPoseTarget } from '../utils/enrollment-guide';

export interface FaceEnrollmentStatus {
  studentId: string;
  status: 'REGISTERED' | 'NOT_REGISTERED';
  sampleCount: number;
  modelName: string | null;
}

export interface FaceSampleResult {
  studentId: string;
  sampleCount: number;
  minimumSamples: number;
  valid: boolean;
  guidance?: string;
}

export interface EnrollmentPreviewPose {
  label: EnrollPoseTarget;
  yawRatio: number;
  rollDegrees: number;
}

export interface EnrollmentPreviewAssessment {
  status: 'GOOD' | 'ACCEPTABLE' | 'TOO_SMALL' | 'BLURRY' | 'BAD_POSE' | 'LOW_DETECTION_CONFIDENCE' | 'OUT_OF_FRAME' | 'TOO_DARK' | 'TOO_BRIGHT';
  isAcceptable: boolean;
  errorCode: string | null;
  sharpness: number;
  brightness: number;
  yawRatio: number;
  rollDegrees: number;
  eyeDistanceRatio: number;
  detectionConfidence: number;
}

export interface EnrollmentPreviewResult {
  faceCount: number;
  frameSizePx?: { width: number; height: number };
  minEnrollmentFaceSizePx?: number;
  minScanFaceSizePx?: number;
  quality?: string;
  faceBox?: { x: number; y: number; width: number; height: number };
  bboxSizePx?: { width: number; height: number };
  assessment?: EnrollmentPreviewAssessment;
  pose?: EnrollmentPreviewPose;
  faceBoxes?: Array<{ x: number; y: number; width: number; height: number }>;
}

export const faceEnrollmentService = {
  async getStatus(studentId: string): Promise<FaceEnrollmentStatus> {
    return apiRequest<FaceEnrollmentStatus>(`/api/students/${studentId}/face-enrollment`);
  },

  async previewEnrollment(blob: Blob, signal?: AbortSignal): Promise<EnrollmentPreviewResult> {
    const formData = new FormData();
    formData.append('image', blob, 'preview.jpg');
    return apiRequest<EnrollmentPreviewResult>('/api/face-engine/enrollment-preview', { method: 'POST', body: formData, signal });
  },

  async addSample(studentId: string, blob: Blob): Promise<FaceSampleResult> {
    const formData = new FormData();
    formData.append('image', blob, 'capture.jpg');
    return apiRequest<FaceSampleResult>(`/api/students/${studentId}/face-enrollment/samples`, { method: 'POST', body: formData });
  },

  async complete(studentId: string): Promise<FaceEnrollmentStatus> {
    return apiRequest<FaceEnrollmentStatus>(`/api/students/${studentId}/face-enrollment/complete`, { method: 'POST' });
  },

  async remove(studentId: string): Promise<{ cleanupPending?: boolean }> {
    return apiRequest(`/api/students/${studentId}/face-enrollment`, { method: 'DELETE' });
  },

  async discardSamples(studentId: string): Promise<void> {
    await apiRequest(`/api/students/${studentId}/face-enrollment/samples`, { method: 'DELETE' });
  },

  getErrorCode(error: unknown): string | undefined {
    return error instanceof ApiError ? error.code : undefined;
  },
};

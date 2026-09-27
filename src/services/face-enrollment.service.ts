import { apiRequest, ApiError } from './api';

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
}

export const faceEnrollmentService = {
  async getStatus(studentId: string): Promise<FaceEnrollmentStatus> {
    return apiRequest<FaceEnrollmentStatus>(`/api/students/${studentId}/face-enrollment`);
  },

  async addSample(studentId: string, blob: Blob): Promise<FaceSampleResult> {
    const formData = new FormData();
    formData.append('image', blob, 'capture.jpg');
    return apiRequest<FaceSampleResult>(`/api/students/${studentId}/face-enrollment/samples`, { method: 'POST', body: formData });
  },

  async complete(studentId: string): Promise<FaceEnrollmentStatus> {
    return apiRequest<FaceEnrollmentStatus>(`/api/students/${studentId}/face-enrollment/complete`, { method: 'POST' });
  },

  async remove(studentId: string): Promise<void> {
    await apiRequest(`/api/students/${studentId}/face-enrollment`, { method: 'DELETE' });
  },

  async discardSamples(studentId: string): Promise<void> {
    await apiRequest(`/api/students/${studentId}/face-enrollment/samples`, { method: 'DELETE' });
  },

  getErrorCode(error: unknown): string | undefined {
    return error instanceof ApiError ? error.code : undefined;
  },
};

/**
 * Tandara Student Service
 * Typed for future FastAPI endpoints:
 * Real student and import endpoints.
 */

import { Student } from '../types';
import { apiRequest, apiRequestBlob } from './api';

export interface CreateStudentPayload {
  fullName: string;
  nis: string;
  gender: 'L' | 'P';
  classId: string;
  guardianId?: string | null;
}

export const studentsService = {
  /**
   * Fetch the active student list from FastAPI.
   */
  async getStudents(): Promise<Student[]> {
    return apiRequest<Student[]>('/api/students');
  },

  async getStudentById(id: string): Promise<Student | null> {
    try {
      return await apiRequest<Student>(`/api/students/${id}`);
    } catch {
      return null;
    }
  },

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
    return apiRequest<Student>('/api/students', { method: 'POST', body: JSON.stringify({
      nis: payload.nis, full_name: payload.fullName, class_id: Number(payload.classId), guardian_id: payload.guardianId ? Number(payload.guardianId) : null, gender: payload.gender,
    }) });
  },

  async enrollFace(studentId: string, faceEmbeddings: number[][]): Promise<{ success: boolean }> {
    void studentId; void faceEmbeddings;
    throw new Error('Enrolmen wajah harus diproses oleh layanan biometrik tepercaya; endpoint tidak menerima embedding dari browser.');
  },

  async importStudents(file: File): Promise<{ importedCount: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<{ importedCount: number }>('/api/students/import', { method: 'POST', body: formData });
  },
  async previewImport(file: File): Promise<{ total_rows:number; valid_rows:number; invalid_rows:number; rows: Array<{ row_number:number; valid:boolean; errors:Array<{field:string;message:string}> }> }> {
    const formData = new FormData(); formData.append('file', file);
    return apiRequest('/api/students/import/preview', { method: 'POST', body: formData });
  },
  async downloadTemplate(): Promise<void> {
    const response = await apiRequestBlob('/api/students/import-template.csv');
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'tandara-template-siswa.csv'; link.click(); URL.revokeObjectURL(url);
  },
};

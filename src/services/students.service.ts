/**
 * Tandara Student Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/students
 * POST   /api/v1/students
 * GET    /api/v1/students/:id
 * POST   /api/v1/students/:id/enroll-face
 * POST   /api/v1/students/import
 */

import { Student } from '../types';
import { apiRequest } from './api';

export interface CreateStudentPayload {
  fullName: string;
  nis: string;
  className: string;
  major: string;
  gender: 'L' | 'P';
  parentName: string;
  parentPhone: string;
  status: 'ACTIVE' | 'GRADUATED' | 'TRANSFERRED' | 'INACTIVE';
}

export const studentsService = {
  /**
   * Fetch students list. Returns empty array in prototype when backend is offline.
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

  async createStudent(payload: Omit<CreateStudentPayload, 'className'> & { classId: string; guardianId?: string | null }): Promise<Student> {
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
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/students/import-template.csv`, { headers: { Authorization: `Bearer ${localStorage.getItem('tandara_access_token') || ''}` } });
    if (!response.ok) throw new Error('Template tidak dapat diunduh.');
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'tandara-template-siswa.csv'; link.click(); URL.revokeObjectURL(url);
  },
};

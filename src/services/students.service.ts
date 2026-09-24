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
    // When backend is connected, use:
    // return await apiRequest<Student[]>('/api/v1/students');
    return [];
  },

  async getStudentById(id: string): Promise<Student | null> {
    try {
      return await apiRequest<Student>(`/api/v1/students/${id}`);
    } catch {
      return null;
    }
  },

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
    return await apiRequest<Student>('/api/v1/students', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async enrollFace(studentId: string, faceEmbeddings: number[][]): Promise<{ success: boolean }> {
    return await apiRequest<{ success: boolean }>(`/api/v1/students/${studentId}/enroll-face`, {
      method: 'POST',
      body: JSON.stringify({ embeddings: faceEmbeddings }),
    });
  },

  async importStudents(file: File): Promise<{ importedCount: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/v1/students/import', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('Backend belum terhubung. Data belum dapat disimpan.');
    return response.json();
  },
};

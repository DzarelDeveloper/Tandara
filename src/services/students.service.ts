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

  async createStudent(payload: CreateStudentPayload): Promise<Student> {
    throw new Error('Pilih kelas dan wali melalui formulir administrasi; kontrak siswa belum mendukung pembuatan gabungan.');
  },

  async enrollFace(studentId: string, faceEmbeddings: number[][]): Promise<{ success: boolean }> {
    void studentId; void faceEmbeddings;
    throw new Error('Enrolmen wajah harus diproses oleh layanan biometrik tepercaya; endpoint tidak menerima embedding dari browser.');
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

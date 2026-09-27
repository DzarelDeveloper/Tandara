import { apiRequest } from './api';

export interface ParentProfile {
  id: string;
  fullName: string;
  phone: string;
  relationship: string;
  username: string;
  isActive: boolean;
}

export interface LinkedStudent {
  id: string;
  nis: string;
  fullName: string;
  className: string;
  isActive: boolean;
  relationship: string;
}

export const parentPortalService = {
  profile: () => apiRequest<ParentProfile>('/api/parent/profile'),
  students: () => apiRequest<LinkedStudent[]>('/api/parent/students'),
};

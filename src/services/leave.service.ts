/**
 * Tandara Leave Requests Service (Guru/Piket review)
 * Typed for future FastAPI endpoints:
 * GET    /api/leave-requests
 * GET    /api/leave-requests
  const requests = await apiRequest<LeaveRequest[]>('/api/leave-requests');
  body: JSON.stringify({ notes }),
 * Approve/reject operations use the current FastAPI contract.
 */

import { LeaveRequest, LeaveStatus } from '../types';
import { apiRequest } from './api';

export const leaveService = {
  async getLeaveRequests(status?: LeaveStatus): Promise<LeaveRequest[]> {
    const requests = await apiRequest<LeaveRequest[]>('/api/leave-requests');
    return status ? requests.filter((request) => request.status === status) : requests;
  },

  async approveRequest(id: string, notes?: string): Promise<void> {
    await apiRequest(`/api/leave-requests/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },

  async rejectRequest(id: string, rejectionReason: string): Promise<void> {
    await apiRequest(`/api/leave-requests/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ rejectionReason }),
    });
  },
};

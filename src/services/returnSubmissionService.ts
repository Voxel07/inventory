import type { ReturnSubmission, ReturnSubmissionFormData, ReturnSubmissionStatus } from '../types';
import { apiRequest } from './apiClient';
import { stageImage } from './stagedImageService';

export function getReturnSubmissions(status?: ReturnSubmissionStatus): Promise<ReturnSubmission[]> {
  return apiRequest('/api/returns', { query: { status } });
}

export async function createReturnSubmission(data: ReturnSubmissionFormData): Promise<ReturnSubmission> {
  const placementImage = data.placementImageFile ? await stageImage(data.placementImageFile) : undefined;
  return apiRequest('/api/returns', {
    method: 'POST',
    body: {
      itemId: data.itemId,
      quantity: data.quantity,
      assetInstanceId: data.assetInstanceId,
      returnedForUserId: data.returnedForUserId,
      factionOrderId: data.factionOrderId,
      placementImage,
      notes: data.notes,
    },
  });
}

export function acknowledgeReturnSubmission(id: string, notes?: string): Promise<ReturnSubmission> {
  return apiRequest(`/api/returns/${id}/acknowledge`, { method: 'POST', body: { notes } });
}

export function rejectReturnSubmission(id: string, notes?: string): Promise<ReturnSubmission> {
  return apiRequest(`/api/returns/${id}/reject`, { method: 'POST', body: { notes } });
}

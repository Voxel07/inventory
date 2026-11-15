import type { ReturnSubmission, ReturnSubmissionFormData, ReturnSubmissionStatus } from '../types';
import { apiPage, apiRequest } from './apiClient';
import type { Page } from './apiPagination';
import { stageImage } from './stagedImageService';
import { captureAuthSession } from './authManager';
import { fieldCommand } from './fieldCommand';

/** Newest first. `mine`: only returns made for the signed-in account, also for warehouse workers. */
export function getReturnSubmissions(page: number, size: number, status?: ReturnSubmissionStatus, mine = false): Promise<Page<ReturnSubmission>> {
  return apiPage('/api/returns', page, size, { query: { status, mine: mine || undefined } });
}

export async function createReturnSubmission(data: ReturnSubmissionFormData): Promise<ReturnSubmission> {
  const context = captureAuthSession();
  const placementImage = data.placementImageFile ? await stageImage(data.placementImageFile, context) : undefined;
  return apiRequest('/api/returns', {
    session: context,
    method: 'POST',
    body: {
      itemId: data.itemId,
      quantity: data.quantity,
      assetInstanceId: data.assetInstanceId,
      returnedForUserId: data.returnedForUserId,
      orderId: data.orderId,
      eventOccurrenceId: data.eventOccurrenceId,
      placementImage,
      notes: data.notes,
    },
  });
}

export function acknowledgeReturnSubmission(id: string, notes?: string, hoursRun?: number): Promise<ReturnSubmission> {
  return fieldCommand({ type: 'return.accept', payload: { returnId: id, input: { notes, hoursRun } } });
}

export function rejectReturnSubmission(id: string, notes?: string): Promise<ReturnSubmission> {
  return apiRequest(`/api/returns/${id}/reject`, { method: 'POST', body: { notes } });
}

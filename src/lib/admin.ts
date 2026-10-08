import type { DocState } from './doc';
export interface MailEvent { key: string; to: string; kind: string; status: string; at: string; error?: string | null; }
export interface AdminItem {
  id: string; ref: string; employeeName: string; employeeId: string; designation: string; department: string;
  recipientEmail: string; status: string; createdAt: string; updatedAt: string; submittedAt?: string | null;
  invitedAt?: string | null; openedAt?: string | null; revision: number; legacy: boolean;
  signatures: Record<'employee' | 'handover' | 'admin', boolean>; emails: MailEvent[];
  document?: DocState; events?: { type: string; detail: string; at: string }[];
}
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function adminRequest<T>(action: string, body?: unknown, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({ action, ...params });
  const response = await fetch(`/api/admin?${query}`, { credentials: 'same-origin', method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new ApiError(data.error || 'The request failed.', response.status);
  return data as T;
}

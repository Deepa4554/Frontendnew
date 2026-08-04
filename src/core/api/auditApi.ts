import { apiClient } from '../network/api';
import { PagedResult } from './types';

export interface AuditEntry {
  id: number;
  timestamp: string;
  userId: number | null;
  userName: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const auditApi = {
  list: (params?: { severity?: string; resource?: string; page?: number; pageSize?: number }) =>
    apiClient.get<PagedResult<AuditEntry>>('/audit-log', { params }).then((r) => r.data),
};

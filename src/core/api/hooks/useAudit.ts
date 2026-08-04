import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../auditApi';
import { queryKeys } from './queryKeys';

export const useAuditLog = (params?: { severity?: string; resource?: string }) =>
  useQuery({ queryKey: queryKeys.audit(params), queryFn: () => auditApi.list(params) });

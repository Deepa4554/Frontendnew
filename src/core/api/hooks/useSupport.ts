import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supportApi, superAdminSupportApi } from '../supportApi';
import { queryKeys } from './queryKeys';

export const useSupportTickets = () => useQuery({ queryKey: queryKeys.supportTickets, queryFn: supportApi.listTickets });

export const useSupportTicket = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.supportTicket(id ?? 0),
    queryFn: () => supportApi.getTicket(id as number),
    enabled: id !== null,
  });

export const useCreateSupportTicket = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subject, message }: { subject: string; message: string }) => supportApi.createTicket(subject, message),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.supportTickets }),
  });
};

export const useAddSupportMessage = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => supportApi.addMessage(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.supportTicket(id) });
      qc.invalidateQueries({ queryKey: queryKeys.supportTickets });
    },
  });
};

export const useSuperAdminTickets = () =>
  useQuery({ queryKey: queryKeys.superAdminTickets, queryFn: superAdminSupportApi.listTickets });

export const useSuperAdminTicket = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.superAdminTicket(id ?? 0),
    queryFn: () => superAdminSupportApi.getTicket(id as number),
    enabled: id !== null,
  });

export const useSuperAdminReplyToTicket = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => superAdminSupportApi.reply(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdminTicket(id) });
      qc.invalidateQueries({ queryKey: queryKeys.superAdminTickets });
    },
  });
};

export const useSuperAdminSetTicketStatus = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'OPEN' | 'RESOLVED') => superAdminSupportApi.setStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.superAdminTicket(id) });
      qc.invalidateQueries({ queryKey: queryKeys.superAdminTickets });
    },
  });
};

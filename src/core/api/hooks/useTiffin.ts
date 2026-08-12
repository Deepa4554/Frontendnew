import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  tiffinApi,
  CreateTiffinSubscriberRequest,
  UpdateTiffinSubscriberRequest,
  MarkTiffinRequest,
  GenerateTiffinInvoicesRequest,
  SettleTiffinInvoiceRequest,
  TiffinInvoiceStatus,
  RechargeTiffinWalletRequest,
} from '../tiffinApi';

// Billing endpoints are Owner/Manager-only server-side; a floor login opening the Tiffin
// screen has the roster/subscribers tabs but never mounts the billing queries, so a 4xx there
// is a real refusal that won't come good on retry — don't burn the global two retries on it.
const noRetryOn4xx = (failureCount: number, error: any) => {
  const status = error?.response?.status;
  if (status >= 400 && status < 500) return false;
  return failureCount < 2;
};

export const useTiffinSubscribers = (params?: { search?: string; includeInactive?: boolean }) =>
  useQuery({ queryKey: ['tiffin', 'subscribers', params], queryFn: () => tiffinApi.listSubscribers(params) });

export const useCreateTiffinSubscriber = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTiffinSubscriberRequest) => tiffinApi.createSubscriber(req),
    // A new subscriber changes the list, today's roster, and this month's billing figures.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

export const useUpdateTiffinSubscriber = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...req }: UpdateTiffinSubscriberRequest & { id: number }) =>
      tiffinApi.updateSubscriber(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

export const useTiffinRoster = (date?: string) =>
  useQuery({ queryKey: ['tiffin', 'roster', date ?? 'today'], queryFn: () => tiffinApi.roster(date) });

export const useMarkTiffin = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: MarkTiffinRequest) => tiffinApi.mark(req),
    // A skip/deliver toggle moves the day's headcount and the month's billable days — refresh
    // the whole tree rather than surgically patching the one date, since billing reads it too.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

export const useTiffinBilling = (month?: string, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['tiffin', 'billing', month ?? 'current'],
    queryFn: () => tiffinApi.billing(month),
    enabled: options?.enabled ?? true,
    retry: noRetryOn4xx,
  });

export const useGenerateTiffinInvoices = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: GenerateTiffinInvoicesRequest) => tiffinApi.generate(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

export const useTiffinInvoices = (status?: TiffinInvoiceStatus, options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['tiffin', 'invoices', status ?? 'all'],
    queryFn: () => tiffinApi.listInvoices(status),
    enabled: options?.enabled ?? true,
    retry: noRetryOn4xx,
  });

export const useTiffinInvoice = (id: number | null) =>
  useQuery({
    queryKey: ['tiffin', 'invoice', id],
    queryFn: () => tiffinApi.getInvoice(id!),
    enabled: id !== null,
    retry: noRetryOn4xx,
  });

export const useSettleTiffinInvoice = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...req }: SettleTiffinInvoiceRequest & { id: number }) =>
      tiffinApi.settleInvoice(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

export const useTiffinWallet = (subscriberId: number | null) =>
  useQuery({
    queryKey: ['tiffin', 'wallet', subscriberId],
    queryFn: () => tiffinApi.getWallet(subscriberId!),
    enabled: subscriberId !== null,
    retry: noRetryOn4xx,
  });

export const useRechargeTiffinWallet = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...req }: RechargeTiffinWalletRequest & { id: number }) =>
      tiffinApi.recharge(id, req),
    // A top-up changes the subscriber list (new balance) and this wallet's own history.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tiffin'] }),
  });
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { khatabookApi, SettleKhataRequest } from '../khatabookApi';

export const useKhatabook = (params?: { search?: string; includeSettled?: boolean }) =>
  useQuery({ queryKey: ['khatabook', params], queryFn: () => khatabookApi.list(params) });

/** Pass null to skip the fetch entirely — that's how OrderBillActions reads a khata only for
 *  the bills that actually put something on one, instead of on every settled bill. */
export const useKhata = (customerId: number | null) =>
  useQuery({
    queryKey: ['khatabook', 'customer', customerId],
    queryFn: () => khatabookApi.get(customerId!),
    enabled: customerId !== null,
    // The global default retries twice, which is right for a flaky connection and pointless
    // for a refusal: Khatabook is Owner/Manager-only, so a cashier opening a credit bill's
    // panel gets a 403 that will never come good. Retrying it just triples the wasted calls.
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;
      if (status >= 400 && status < 500) return false;
      return failureCount < 2;
    },
  });

/** Invalidates the whole 'khatabook' tree rather than just this customer's key — a
 *  repayment moves the list's summary totals and this customer's position in it, not only
 *  the ledger that was open. */
export const useSettleKhata = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, ...req }: SettleKhataRequest & { customerId: number }) =>
      khatabookApi.settle(customerId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['khatabook'] }),
  });
};

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  customersApi,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  IssueCouponRequest,
  IssueGiftCardRequest,
} from '../customersApi';
import { queryKeys } from './queryKeys';

export const useCustomers = (search?: string) =>
  useQuery({ queryKey: queryKeys.customers({ search }), queryFn: () => customersApi.list({ search }) });

export const useCustomer = (id: number | null) =>
  useQuery({ queryKey: queryKeys.customer(id ?? -1), queryFn: () => customersApi.get(id as number), enabled: id !== null });

/** Fires only once `phone` is a complete 10-digit number — that alone keeps this from
 * spamming the API on every keystroke while the guest number is being typed. */
export const useCustomerByPhone = (phone: string) =>
  useQuery({
    queryKey: queryKeys.customerByPhone(phone),
    queryFn: () => customersApi.lookupByPhone(phone),
    enabled: phone.length === 10,
    staleTime: 60_000,
  });

export const useCrmInsights = () => useQuery({ queryKey: queryKeys.crmInsights, queryFn: customersApi.insights });

/** Powers the Coupon/Gift Card quick-fill at checkout — see BillAdjustmentsPanel's
 * quickFill on those tiles in OrderBillActions. A display aid only, so a stale read here
 * just means a suggested code that's briefly out of date, never a wrong one actually applied
 * (bill-coupon/bill-giftcard re-validate from scratch). */
export const useRedeemableOffers = (customerId: number | null) =>
  useQuery({
    queryKey: queryKeys.redeemableOffers(customerId ?? -1),
    queryFn: () => customersApi.redeemableOffers(customerId as number),
    enabled: customerId !== null,
  });

export const useCreateCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateCustomerRequest) => customersApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useUpdateCustomer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateCustomerRequest }) => customersApi.update(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useRedeemPoints = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, points, reason }: { id: number; points: number; reason?: string }) => customersApi.redeemPoints(id, points, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useAddPoints = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, points, reason }: { id: number; points: number; reason?: string }) => customersApi.addPoints(id, points, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useIssueCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, req }: { customerId: number; req: IssueCouponRequest }) => customersApi.issueCoupon(customerId, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useApplyCoupon = () =>
  useMutation({ mutationFn: ({ code, orderSubtotal }: { code: string; orderSubtotal: number }) => customersApi.applyCoupon(code, orderSubtotal) });

export const useRedeemCoupon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (couponId: number) => customersApi.redeemCoupon(couponId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useIssueGiftCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: IssueGiftCardRequest) => customersApi.issueGiftCard(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useCheckGiftCard = () => useMutation({ mutationFn: (code: string) => customersApi.checkGiftCard(code) });

export const useRedeemGiftCard = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ code, amount }: { code: string; amount: number }) => customersApi.redeemGiftCard(code, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

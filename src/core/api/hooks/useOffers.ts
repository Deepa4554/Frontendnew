import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { offersApi, CreateOfferRequest, OfferPreviewLine, UpdateOfferRequest } from '../offersApi';
import { queryKeys } from './queryKeys';

export const useOffers = (includeInactive = false) =>
  useQuery({ queryKey: [...queryKeys.offers, includeInactive], queryFn: () => offersApi.list(includeInactive) });

/**
 * Prices a cart against every live offer — what the POS banner reads to say which offer is
 * firing and what one more item would unlock. No draft, so this is the real evaluation the
 * server will redo when the order is actually created (see OrderBuildingService.ApplyOffersAsync),
 * not a client-side guess that could disagree with the bill.
 *
 * The lines go in the query key, so re-pricing is automatic as the cart changes and an
 * unchanged cart is served from cache instead of re-asking. placeholderData keeps the previous
 * answer on screen while the next one is in flight — without it the banner blinks out on every
 * single tap of +/−.
 */
export const useOfferPreview = (lines: OfferPreviewLine[]) =>
  useQuery({
    queryKey: [...queryKeys.offers, 'preview', lines],
    queryFn: () => offersApi.preview({ lines }),
    enabled: lines.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });

export const useCreateOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateOfferRequest) => offersApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.offers }),
  });
};

export const useUpdateOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: number; req: UpdateOfferRequest }) => offersApi.update(id, req),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.offers }),
  });
};

export const useDeleteOffer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => offersApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.offers }),
  });
};

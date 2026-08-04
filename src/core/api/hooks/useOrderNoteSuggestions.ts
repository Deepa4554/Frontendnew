import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { orderNoteSuggestionsApi } from '../orderNoteSuggestionsApi';
import { queryKeys } from './queryKeys';

export const useOrderNoteSuggestions = () =>
  useQuery({ queryKey: queryKeys.orderNoteSuggestions, queryFn: orderNoteSuggestionsApi.list });

export const useUpsertOrderNoteSuggestion = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => orderNoteSuggestionsApi.upsert(text),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.orderNoteSuggestions }),
  });
};

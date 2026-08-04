import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../searchApi';
import { queryKeys } from './queryKeys';

export const useSearch = (q: string) =>
  useQuery({ queryKey: queryKeys.search(q), queryFn: () => searchApi.search(q), enabled: q.trim().length >= 2 });

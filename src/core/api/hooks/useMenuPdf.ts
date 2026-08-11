import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { menuPdfApi } from '../menuPdfApi';
import { queryKeys } from './queryKeys';

/** The cafe's PDF-menu status. Not polled — it only changes from this same admin screen. */
export const useMenuPdfStatus = () =>
  useQuery({ queryKey: queryKeys.menuPdf, queryFn: menuPdfApi.getStatus });

export const useUploadMenuPdf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dataUri, fileName }: { dataUri: string; fileName?: string }) =>
      menuPdfApi.upload(dataUri, fileName),
    onSuccess: (status) => qc.setQueryData(queryKeys.menuPdf, status),
  });
};

export const useToggleMenuPdf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => menuPdfApi.toggle(enabled),
    onSuccess: (status) => qc.setQueryData(queryKeys.menuPdf, status),
  });
};

export const useRemoveMenuPdf = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => menuPdfApi.remove(),
    onSuccess: (status) => qc.setQueryData(queryKeys.menuPdf, status),
  });
};

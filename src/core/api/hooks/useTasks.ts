import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tasksApi, CreateTaskRequest, TaskStatus } from '../tasksApi';
import { queryKeys } from './queryKeys';

export const useTasks = (params?: { status?: TaskStatus; assignedToId?: number }) =>
  useQuery({ queryKey: queryKeys.tasks(params), queryFn: () => tasksApi.list(params) });

export const useCreateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTaskRequest) => tasksApi.create(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useUpdateTaskStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: TaskStatus }) => tasksApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

export const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tasksApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
};

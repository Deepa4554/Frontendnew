import { apiClient } from '../network/api';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';

export interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  assignedToId: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  createdAt: string;
  tags: string[];
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  assignedToId?: number;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate: string;
  tags?: string[];
}

const STATUS_TO_WIRE: Record<TaskStatus, 'Todo' | 'InProgress' | 'Done' | 'Blocked'> = {
  TODO: 'Todo',
  IN_PROGRESS: 'InProgress',
  DONE: 'Done',
  BLOCKED: 'Blocked',
};

export const tasksApi = {
  list: (params?: { status?: TaskStatus; assignedToId?: number }) =>
    apiClient
      .get<ApiTask[]>('/tasks', { params: params?.status ? { ...params, status: STATUS_TO_WIRE[params.status] } : params })
      .then((r) => r.data),
  create: (req: CreateTaskRequest) => apiClient.post<ApiTask>('/tasks', req).then((r) => r.data),
  updateStatus: (id: number, status: TaskStatus) =>
    apiClient.patch<ApiTask>(`/tasks/${id}/status`, { status: STATUS_TO_WIRE[status] }).then((r) => r.data),
  remove: (id: number) => apiClient.delete<void>(`/tasks/${id}`).then((r) => r.data),
};

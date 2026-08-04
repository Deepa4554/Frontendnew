import { apiClient } from '../network/api';

export interface SupportMessage {
  id: number;
  fromAdmin: boolean;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface SupportTicket {
  id: number;
  subject: string;
  status: 'OPEN' | 'RESOLVED';
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  tenantName: string | null;
}

export interface SupportTicketDetail extends Omit<SupportTicket, 'messageCount'> {
  messages: SupportMessage[];
}

export const supportApi = {
  listTickets: () => apiClient.get<SupportTicket[]>('/support/tickets').then((r) => r.data),
  getTicket: (id: number) => apiClient.get<SupportTicketDetail>(`/support/tickets/${id}`).then((r) => r.data),
  createTicket: (subject: string, message: string) =>
    apiClient.post<SupportTicketDetail>('/support/tickets', { subject, message }).then((r) => r.data),
  addMessage: (id: number, body: string) =>
    apiClient.post<SupportTicketDetail>(`/support/tickets/${id}/messages`, { body }).then((r) => r.data),
};

export const superAdminSupportApi = {
  listTickets: () => apiClient.get<SupportTicket[]>('/superadmin/tickets').then((r) => r.data),
  getTicket: (id: number) => apiClient.get<SupportTicketDetail>(`/superadmin/tickets/${id}`).then((r) => r.data),
  reply: (id: number, body: string) =>
    apiClient.post<SupportTicketDetail>(`/superadmin/tickets/${id}/messages`, { body }).then((r) => r.data),
  setStatus: (id: number, status: 'OPEN' | 'RESOLVED') =>
    apiClient.patch<SupportTicketDetail>(`/superadmin/tickets/${id}/status`, { status }).then((r) => r.data),
};

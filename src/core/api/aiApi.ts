import { apiClient } from '../network/api';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export const aiApi = {
  chat: (history: AiChatMessage[], message: string) =>
    apiClient.post<{ reply: string }>('/ai/chat', { history, message }).then((r) => r.data.reply),
};

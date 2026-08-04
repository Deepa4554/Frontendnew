import { useMutation } from '@tanstack/react-query';
import { aiApi, AiChatMessage } from '../aiApi';

export const useAiChat = () =>
  useMutation({
    mutationFn: ({ history, message }: { history: AiChatMessage[]; message: string }) => aiApi.chat(history, message),
  });

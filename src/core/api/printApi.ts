import { apiClient } from '../network/api';

export const printApi = {
  printWifi: (ip: string, port: number, dataBase64: string) =>
    apiClient.post<void>('/print/wifi', { ip, port, dataBase64 }).then((r) => r.data),
};

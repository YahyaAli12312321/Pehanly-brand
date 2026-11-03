import { get } from '../lib/apiClient';

export const healthApi = {
  /** GET /health/ready -> { status, database } (503 when the database is down) */
  ready: async () => (await get('/health/ready')).data,
};

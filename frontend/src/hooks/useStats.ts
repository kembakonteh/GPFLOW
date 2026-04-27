import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { OperatorStats } from '../types';

export function useOperatorStats() {
  return useQuery<OperatorStats>({
    queryKey: ['operator', 'stats'],
    queryFn:  async () => (await api.get('/operators/me/stats')).data,
    staleTime: 60_000,
  });
}

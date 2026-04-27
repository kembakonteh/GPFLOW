import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Booking } from '../types';

export function useRegenerateLabel(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<Booking, Error, void>({
    mutationFn: async () => (await api.post(`/labels/${bookingId}/regenerate`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings'] }),
  });
}

export function useDownloadLabel() {
  return useMutation<void, Error, string>({
    mutationFn: async (bookingId) => {
      // The endpoint returns a 302 redirect to a presigned URL.
      // We open it directly in a new tab.
      window.open(`/api/v1/labels/${bookingId}/download`, '_blank');
    },
  });
}

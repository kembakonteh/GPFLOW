import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Booking, StatusUpdate, WeighInRequest } from '../types';

const KEYS = {
  list:   (params?: object) => ['bookings', params] as const,
  detail: (id: string)      => ['bookings', id]     as const,
  byRef:  (ref: string)     => ['bookings', 'ref', ref] as const,
};

// ── List ─────────────────────────────────────────────────────────────────────

export function useBookings(params?: { trip_id?: string; status?: string; limit?: number }) {
  return useQuery<Booking[]>({
    queryKey: KEYS.list(params),
    queryFn:  async () => (await api.get('/bookings', { params })).data,
    enabled:  !!localStorage.getItem('gpflow_access_token'),
  });
}

// ── Single ────────────────────────────────────────────────────────────────────

export function useBooking(id: string) {
  return useQuery<Booking>({
    queryKey: KEYS.detail(id),
    queryFn:  async () => (await api.get(`/bookings/${id}`)).data,
    enabled:  !!id,
  });
}

// ── By reference ──────────────────────────────────────────────────────────────

export function useBookingByRef(ref: string) {
  return useQuery<Booking>({
    queryKey: KEYS.byRef(ref),
    queryFn:  async () => (await api.get(`/bookings/by-ref/${ref}`)).data,
    enabled:  !!ref,
  });
}

// ── Update status ─────────────────────────────────────────────────────────────

export function useUpdateBookingStatus(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<Booking, Error, StatusUpdate>({
    mutationFn: async (body) => (await api.patch(`/bookings/${bookingId}/status`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(bookingId), data);
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ── Weigh in ──────────────────────────────────────────────────────────────────

export function useWeighIn(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<Booking, Error, WeighInRequest>({
    mutationFn: async (body) => (await api.post(`/bookings/${bookingId}/weigh`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(bookingId), data);
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export function useScanBooking(bookingId: string) {
  const qc = useQueryClient();
  return useMutation<Booking, Error, { note?: string }>({
    mutationFn: async (body) => (await api.post(`/bookings/${bookingId}/scan`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(bookingId), data);
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

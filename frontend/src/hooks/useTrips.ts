import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ArrivalRequest, Trip, TripCreate, TripUpdate } from '../types';

const KEYS = {
  list:   (params?: object) => ['trips', params] as const,
  detail: (id: string)      => ['trips', id]     as const,
};

// ── List ─────────────────────────────────────────────────────────────────────

export function useTrips(params?: { status?: string; direction?: string; limit?: number }) {
  return useQuery<Trip[]>({
    queryKey: KEYS.list(params),
    queryFn:  async () => (await api.get('/trips', { params })).data,
  });
}

// ── Single ────────────────────────────────────────────────────────────────────

export function useTrip(id: string) {
  return useQuery<Trip>({
    queryKey: KEYS.detail(id),
    queryFn:  async () => (await api.get(`/trips/${id}`)).data,
    enabled:  !!id,
  });
}

// ── Create ────────────────────────────────────────────────────────────────────

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation<Trip, Error, TripCreate>({
    mutationFn: async (body) => (await api.post('/trips', body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// ── Update ────────────────────────────────────────────────────────────────────

export function useUpdateTrip(id: string) {
  const qc = useQueryClient();
  return useMutation<Trip, Error, TripUpdate>({
    mutationFn: async (body) => (await api.patch(`/trips/${id}`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(id), data);
      qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => { await api.delete(`/trips/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

// ── Arrive ────────────────────────────────────────────────────────────────────

export function useArriveTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation<Trip, Error, ArrivalRequest>({
    mutationFn: async (body) => (await api.post(`/trips/${tripId}/arrive`, body)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(tripId), data);
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

// ── Complete ─────────────────────────────────────────────────────────────────

export function useCompleteTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation<Trip, Error, void>({
    mutationFn: async () => (await api.post(`/trips/${tripId}/complete`)).data,
    onSuccess: (data) => {
      qc.setQueryData(KEYS.detail(tripId), data);
      qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

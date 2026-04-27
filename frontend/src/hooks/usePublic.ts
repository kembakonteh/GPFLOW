import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { BookingPublicCreate, BookingPublicResponse, BookingTracking, PublicTrip } from '../types';

// ── Public trip (no auth) ─────────────────────────────────────────────────────

export function usePublicTrip(slug: string) {
  return useQuery<PublicTrip>({
    queryKey: ['public-trip', slug],
    queryFn:  async () => (await api.get(`/trips/public/${slug}`)).data,
    enabled:  !!slug,
    staleTime: 30_000,
  });
}

// ── Track booking (30 s polling) ──────────────────────────────────────────────

export function useTrackBooking(ref: string, enabled = true) {
  return useQuery<BookingTracking>({
    queryKey:       ['track', ref],
    queryFn:        async () => (await api.get(`/bookings/track/${ref}`)).data,
    enabled:        !!ref && enabled,
    refetchInterval: 30_000,
    staleTime:       15_000,
  });
}

// ── Create booking (public) ───────────────────────────────────────────────────

export function useCreatePublicBooking() {
  return useMutation<BookingPublicResponse, Error, BookingPublicCreate>({
    mutationFn: async (body) => (await api.post('/bookings', body)).data,
  });
}

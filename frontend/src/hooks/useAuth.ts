import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearTokens, saveTokens } from '../lib/api';
import type { AuthResponse, LoginRequest, Operator, RegisterRequest } from '../types';

const KEYS = { me: ['operator', 'me'] as const };

// ── Current operator ──────────────────────────────────────────────────────────

export function useMe() {
  return useQuery<Operator>({
    queryKey: KEYS.me,
    queryFn:  async () => (await api.get('/operators/me')).data,
    enabled:  !!localStorage.getItem('gpflow_access_token'),
    staleTime: 5 * 60_000,
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────

export function useLogin() {
  const qc = useQueryClient();
  return useMutation<AuthResponse, Error, LoginRequest>({
    mutationFn: async (body) => (await api.post('/auth/login', body)).data,
    onSuccess: (data) => {
      saveTokens(data.access_token, data.refresh_token);
      qc.setQueryData(KEYS.me, data.operator);
    },
  });
}

// ── Register ──────────────────────────────────────────────────────────────────

export function useRegister() {
  const qc = useQueryClient();
  return useMutation<AuthResponse, Error, RegisterRequest>({
    mutationFn: async (body) => (await api.post('/auth/register', body)).data,
    onSuccess: (data) => {
      saveTokens(data.access_token, data.refresh_token);
      qc.setQueryData(KEYS.me, data.operator);
    },
  });
}

// ── Logout ────────────────────────────────────────────────────────────────────

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const refresh = localStorage.getItem('gpflow_refresh_token');
      if (refresh) await api.post('/auth/logout', { refresh_token: refresh }).catch(() => {});
    },
    onSettled: () => {
      clearTokens();
      qc.clear();
      window.location.href = '/login';
    },
  });
}

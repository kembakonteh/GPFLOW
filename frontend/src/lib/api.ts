import axios from "axios";

const ACCESS_KEY = "gpflow_access_token";
const REFRESH_KEY = "gpflow_refresh_token";

export const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor — attach Bearer token ─────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — transparent token refresh on 401 ──────────────
let isRefreshing = false;
// Queue of { resolve, reject } for requests that arrived during a refresh
let waitQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function drainQueue(token: string | null, error: unknown = null) {
  waitQueue.forEach(({ resolve, reject }) => (token ? resolve(token) : reject(error)));
  waitQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    // Only attempt refresh on 401, and not for the refresh endpoint itself
    if (error.response?.status !== 401 || original._retried || original.url?.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    original._retried = true;

    if (isRefreshing) {
      // Another request is already refreshing — queue this one
      return new Promise((resolve, reject) => {
        waitQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;

    try {
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) throw new Error("No refresh token");

      const { data } = await api.post("/auth/refresh", { refresh_token: refreshToken });
      const newAccess: string = data.access_token;

      localStorage.setItem(ACCESS_KEY, newAccess);
      api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;

      drainQueue(newAccess);
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
      drainQueue(null, refreshError);
      // Clear tokens, show message on login page, redirect
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      sessionStorage.setItem("gpflow_auth_msg", "Your session expired — please log in again.");
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Convenience auth helpers ──────────────────────────────────────────────
export function saveTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

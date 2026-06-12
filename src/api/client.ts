import axios, { AxiosError } from 'axios';

import { API_BASE_URL } from '@/api/config';
import { tokenStore } from '@/auth/tokenStore';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Lets the auth layer react to a rejected token (e.g. drop the session).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

// API_BASE_URL already includes the full prefix (e.g. .../api/v1/staff),
// so paths are relative to it (e.g. '/login', '/stock-dashboard').
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

// Attach the Bearer token to every request automatically.
api.interceptors.request.use(async (config) => {
  const token = await tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the token is rejected, clear it so the app can return to login.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string; error?: unknown }>) => {
    if (error.response?.status === 401) {
      await tokenStore.clear();
      onUnauthorized?.();
    }
    return Promise.reject(new ApiError(extractMessage(error), error.response?.status ?? 0));
  },
);

/** Pulls a readable message from Laravel responses ({message} or {error:{field:[...]}}). */
function extractMessage(error: AxiosError<{ message?: string; error?: unknown }>): string {
  const data = error.response?.data;
  if (data) {
    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;
    if (data.error && typeof data.error === 'object') {
      const first = Object.values(data.error as Record<string, unknown>)[0];
      if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    }
  }
  return error.message || 'Request failed. Please try again.';
}

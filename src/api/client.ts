import axios, { AxiosError } from 'axios';

import { getBaseUrl } from '@/api/config';
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

// The base URL is resolved per request via getBaseUrl(), so a runtime override
// takes effect immediately. It already includes the full prefix
// (e.g. .../api/v1/staff), so paths are relative to it ('/login', etc.).
export const api = axios.create({
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  // Fail fast instead of hanging until an upstream gateway 504s (~60s). A slow
  // endpoint then surfaces as a clear timeout error rather than a frozen screen.
  timeout: 30000,
});

// Resolve the current base URL and attach the Bearer token on every request.
api.interceptors.request.use(async (config) => {
  config.baseURL = getBaseUrl();
  const token = await tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (__DEV__) {
    // Stamp the start time so the response interceptor can log how long the
    // request actually took — useful for spotting which endpoint is slow.
    (config as { metadata?: { start: number } }).metadata = { start: Date.now() };
  }
  return config;
});

// If the token is rejected, clear it so the app can return to login.
api.interceptors.response.use(
  (response) => {
    if (__DEV__) logTiming(response.config, response.status);
    return response;
  },
  async (error: AxiosError<{ message?: string; error?: unknown }>) => {
    if (__DEV__) {
      logTiming(error.config, error.response?.status, error.code);
    }
    if (error.response?.status === 401) {
      await tokenStore.clear();
      onUnauthorized?.();
    }
    return Promise.reject(new ApiError(extractMessage(error), error.response?.status ?? 0));
  },
);

/** Logs the method, path, status and elapsed time so slow endpoints stand out. */
function logTiming(
  config: AxiosError['config'],
  status?: number,
  code?: string,
) {
  const start = (config as { metadata?: { start: number } } | undefined)?.metadata?.start;
  const ms = start ? Date.now() - start : undefined;
  const method = config?.method?.toUpperCase() ?? 'GET';
  console.log(
    `[api] ${method} ${config?.url ?? ''} → ${status ?? code ?? 'ERR'}${
      ms != null ? ` in ${ms}ms` : ''
    }`,
  );
}

/** Pulls a readable message from Laravel responses ({message} or {error:{field:[...]}}). */
function extractMessage(error: AxiosError<{ message?: string; error?: unknown }>): string {
  // Network-level failures (no HTTP response): timeout or unreachable server.
  if (!error.response) {
    if (error.code === 'ECONNABORTED') {
      return 'The server took too long to respond (timeout). The endpoint may be overloaded — please try again.';
    }
    return 'Could not reach the server. Check your connection and try again.';
  }

  const status = error.response.status;
  // Gateway/upstream errors mean the server itself is timing out or down.
  if (status === 504) {
    return 'The server timed out loading this data (504). The inventory endpoint is too slow — this needs a backend fix.';
  }
  if (status === 502 || status === 503) {
    return `The server is temporarily unavailable (${status}). Please try again shortly.`;
  }

  const data = error.response.data;
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

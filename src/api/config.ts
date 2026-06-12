/**
 * Base URL for the staff API. Set EXPO_PUBLIC_API_URL in your .env to point at
 * the backend (e.g. https://api.moptic.com). When unset, the app falls back to
 * the in-memory mock data so it still runs without a server.
 */
// Trailing slashes are stripped so paths join cleanly (the client adds `/api/v1`).
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export function isApiConfigured() {
  return API_BASE_URL.length > 0;
}

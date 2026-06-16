/**
 * API base URL resolution.
 *
 * The build-time default comes from EXPO_PUBLIC_API_URL. On top of that a user
 * can set a runtime override (persisted), so the app can be pointed at a
 * different backend without rebuilding. The client reads `getBaseUrl()` on every
 * request, so changes take effect immediately.
 */
import { storage } from '@/lib/storage';

const OVERRIDE_KEY = 'moptic.apiBaseUrl';

/** Strip trailing slashes so paths join cleanly (the client adds `/login` etc.). */
function normalize(url: string) {
  return url.trim().replace(/\/+$/, '');
}

/** The base URL baked in at build time (EXPO_PUBLIC_API_URL). */
export const API_BASE_URL = normalize(process.env.EXPO_PUBLIC_API_URL ?? '');

let currentBaseUrl = API_BASE_URL;
let override: string | null = null;

/** The base URL currently in use (runtime override if set, else the build default). */
export function getBaseUrl() {
  return currentBaseUrl;
}

export function isApiConfigured() {
  return currentBaseUrl.length > 0;
}

/** True when a runtime override is active (differs from the build default). */
export function hasBaseUrlOverride() {
  return override !== null;
}

/** Load any persisted override. Call once on app start before the first request. */
export async function loadBaseUrlOverride() {
  try {
    const saved = await storage.getItem(OVERRIDE_KEY);
    if (saved && saved.trim().length > 0) {
      override = normalize(saved);
      currentBaseUrl = override;
    }
  } catch {
    // Ignore storage errors; fall back to the build default.
  }
}

/**
 * Set and persist a runtime override. Pass an empty string to clear it and
 * fall back to the build default. Returns the resolved base URL now in use.
 */
export async function setBaseUrlOverride(url: string) {
  const next = normalize(url);
  if (next.length === 0) {
    override = null;
    currentBaseUrl = API_BASE_URL;
    await storage.removeItem(OVERRIDE_KEY);
  } else {
    override = next;
    currentBaseUrl = next;
    await storage.setItem(OVERRIDE_KEY, next);
  }
  return currentBaseUrl;
}

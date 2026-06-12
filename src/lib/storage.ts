import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Persistent key/value storage. SecureStore is unavailable on web, so fall back
 * to localStorage there. Keeps the same async surface so callers don't branch.
 */
export const storage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

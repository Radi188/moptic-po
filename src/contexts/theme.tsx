import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { storage } from '@/lib/storage';

const PREFERENCE_KEY = 'moptic.theme';

/** What the user picked. `system` follows the OS setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

/** The concrete scheme actually applied to the UI. */
export type ColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  /** The user's choice (`system` | `light` | `dark`). */
  preference: ThemePreference;
  /** The resolved scheme to render (`system` collapsed to the OS value). */
  scheme: ColorScheme;
  /** Persist and apply a new preference. */
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useSystemColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // Load the saved preference once on launch.
  useEffect(() => {
    let active = true;
    storage.getItem(PREFERENCE_KEY).then((saved) => {
      if (active && isPreference(saved)) setPreferenceState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    storage.setItem(PREFERENCE_KEY, next);
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, scheme, setPreference }),
    [preference, scheme, setPreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/**
 * Theme preference + resolved scheme. Falls back to a light, no-op value when
 * used outside the provider so styling never crashes.
 */
export function useThemePreference(): ThemeContextValue {
  return (
    use(ThemeContext) ?? {
      preference: 'system',
      scheme: 'light',
      setPreference: () => {},
    }
  );
}

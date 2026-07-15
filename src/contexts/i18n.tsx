import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  translations,
  type Language,
  type TranslationKey,
} from '@/i18n/translations';
import { storage } from '@/lib/storage';

const PREFERENCE_KEY = 'moptic.language';

/** Values interpolated into `{{name}}` placeholders in a translation string. */
export type TranslateParams = Record<string, string | number>;

/** Translate a key into the active language, filling any `{{name}}` tokens. */
export type TranslateFn = (key: TranslationKey, params?: TranslateParams) => string;

/** Replace `{{name}}` tokens in `template` with values from `params`. */
function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

type I18nContextValue = {
  /** The active language code. */
  language: Language;
  /** Persist and apply a new language. */
  setLanguage: (language: Language) => void;
  /** Look up a string in the active language. */
  t: TranslateFn;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return value === 'en' || value === 'km';
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>('en');

  // Load the saved language once on launch.
  useEffect(() => {
    let active = true;
    storage.getItem(PREFERENCE_KEY).then((saved) => {
      if (active && isLanguage(saved)) setLanguageState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    storage.setItem(PREFERENCE_KEY, next);
  }, []);

  // Falls back to the key itself if a string is ever missing, so nothing crashes.
  const t = useCallback<TranslateFn>(
    (key, params) =>
      interpolate(translations[language][key] ?? translations.en[key] ?? key, params),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

/**
 * Active language + a `t()` translator. Falls back to English/no-op when used
 * outside the provider so rendering never crashes.
 */
export function useTranslation(): I18nContextValue {
  return (
    use(I18nContext) ?? {
      language: 'en',
      setLanguage: () => {},
      t: (key, params) => interpolate(translations.en[key] ?? key, params),
    }
  );
}

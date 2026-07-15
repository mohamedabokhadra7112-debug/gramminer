import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import arTranslations from '../locales/ar.json';
import enTranslations from '../locales/en.json';

export type Lang = 'ar' | 'en';

export const SUPPORTED_LANGUAGES: { value: Lang; label: string; flag: string }[] = [
  { value: 'ar', label: 'العربية', flag: '🇸🇦' },
  { value: 'en', label: 'English',  flag: '🇺🇸' },
];

const STORAGE_KEY = 'gramminer_lang';

type Translations = typeof arTranslations;

type LanguageContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key, with optional variable substitution: t('key', { name: 'Ali' }) */
  t: (key: keyof Translations | string, vars?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId?: number | null;
}) {
  const storageKey = userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;

  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const stored = localStorage.getItem(userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY);
      if (stored === 'ar' || stored === 'en') return stored;
    } catch {}
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return tgLang === 'ar' ? 'ar' : 'en';
  });

  // Apply direction whenever lang changes
  useEffect(() => {
    document.documentElement.dir  = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Re-read from localStorage when storageKey changes (userId resolves)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'ar' || stored === 'en') setLangState(stored);
    } catch {}
  }, [storageKey]);

  // Load persisted language from server once initData is available
  useEffect(() => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    fetch('/api/user/language', { headers: { 'x-init-data': initData } })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { language?: string } | null) => {
        if (data?.language === 'ar' || data?.language === 'en') {
          const l = data.language as Lang;
          setLangState(l);
          try { localStorage.setItem(storageKey, l); } catch {}
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(storageKey, l); } catch {}
    const initData = window.Telegram?.WebApp?.initData;
    if (initData) {
      fetch('/api/user/language', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, language: l }),
      }).catch(() => {});
    }
  }, [storageKey]);

  const t = useCallback((key: string, vars?: Record<string, string>): string => {
    const map = lang === 'ar'
      ? (arTranslations as Record<string, string>)
      : (enTranslations as Record<string, string>);
    let str = map[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, v);
      }
    }
    return str;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

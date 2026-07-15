import React, { createContext, useContext, useEffect, useState } from 'react';

export type Lang = 'ar' | 'en';

export const SUPPORTED_LANGUAGES: { value: Lang; label: string; flag: string }[] = [
  { value: 'ar', label: 'العربية', flag: '🇸🇦' },
  { value: 'en', label: 'English', flag: '🇺🇸' },
];

const STORAGE_KEY = 'gramminer_lang';

type LanguageContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
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
      const stored = localStorage.getItem(storageKey);
      if (stored === 'ar' || stored === 'en') return stored;
    } catch {}
    // Default: detect from Telegram WebApp language_code
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return tgLang === 'ar' ? 'ar' : 'en';
  });

  // Re-read when userId changes (user logs in after mount)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'ar' || stored === 'en') setLangState(stored);
    } catch {}
  }, [storageKey]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(storageKey, l);
    } catch {}
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

import React, { createContext, useContext, useEffect, useState } from 'react';

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUserContextType = {
  user: TelegramUser | null;
  avatarUrl: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  isLoading: boolean;
};

const TelegramUserContext = createContext<TelegramUserContextType | null>(null);

export function TelegramUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData;

    if (!initData) {
      // Not running inside Telegram (e.g. opened directly in a browser) —
      // fall back to whatever unsigned info Telegram exposes, if any.
      const fallback = tg?.initDataUnsafe?.user;
      setUser(fallback?.id ? { id: fallback.id, first_name: fallback.first_name, username: fallback.username } : null);
      setIsLoading(false);
      return;
    }

    fetch('/api/telegram/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setUser(data.user);
          setIsVerified(true);
          setIsAdmin(data.isAdmin === true);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const avatarUrl = user?.id ? `/api/telegram/avatar/${user.id}` : null;

  return (
    <TelegramUserContext.Provider value={{ user, avatarUrl, isVerified, isAdmin, isLoading }}>
      {children}
    </TelegramUserContext.Provider>
  );
}

export function useTelegramUser() {
  const ctx = useContext(TelegramUserContext);
  if (!ctx) throw new Error('useTelegramUser must be used within TelegramUserProvider');
  return ctx;
}

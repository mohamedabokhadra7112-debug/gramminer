import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/telegramApi';

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  /** GMR balance persisted in the Neon DB, as of the last /telegram/auth sync. */
  balance?: number;
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

    // Hits the Backend's sync/login endpoint: verifies initData server-side,
    // registers the user on first sight (0 GMR) or refreshes their stored
    // name, and returns their persisted balance so the UI never shows a
    // stale "Miner" placeholder for a returning user.
    fetch(`${API_BASE}/api/telegram/auth`, {
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

  const avatarUrl = user?.id ? `${API_BASE}/api/telegram/avatar/${user.id}` : null;

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

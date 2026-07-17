import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE } from '@/lib/telegramApi';

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  /** gram balance persisted in the DB, as of the last /telegram/auth sync. */
  balance?: number;
  /** coin balance persisted in the DB (used for miner purchases). */
  coins?: number;
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

    // ── Step 1: show the real name IMMEDIATELY from initDataUnsafe ──────────
    // This is always available inside Telegram and requires no server round-trip.
    // The user sees their real name right away, even before the server responds.
    const unsafeUser = tg?.initDataUnsafe?.user;
    if (unsafeUser?.id) {
      setUser({
        id:         unsafeUser.id,
        first_name: unsafeUser.first_name,
        last_name:  unsafeUser.last_name,
        username:   unsafeUser.username,
        balance:    0,
      });
    }

    // ── Step 2: verify server-side and fetch the persisted DB balance ────────
    const initData = tg?.initData;

    if (!initData) {
      // Not running inside Telegram (e.g. browser preview) — nothing more to do.
      setIsLoading(false);
      return;
    }

    // Safety valve: never leave the user on a loading screen forever.
    // If the auth fetch hangs (cold API start, network issue), unblock after 8 s.
    const safetyTimer = setTimeout(() => setIsLoading(false), 8000);

    fetch(`${API_BASE}/api/telegram/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(res => (res.ok ? res.json() : Promise.reject(`HTTP ${res.status}`)))
      .then(data => {
        if (data?.user) {
          // Overwrite with the server-verified user + real DB balance
          setUser(data.user);
          setIsVerified(true);
          setIsAdmin(data.isAdmin === true);
        }
      })
      .catch(err => {
        // Auth call failed — keep showing the initDataUnsafe name (set in Step 1)
        // so the user always sees their real name, never "Miner".
        console.warn('Telegram auth sync failed (showing local name):', err);
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        setIsLoading(false);
      });
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

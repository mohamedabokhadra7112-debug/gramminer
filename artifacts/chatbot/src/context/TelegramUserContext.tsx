import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

export type UnsubscribedChannel = {
  channelUsername: string;
  channelName: string;
};

type TelegramUserContextType = {
  user: TelegramUser | null;
  avatarUrl: string | null;
  isVerified: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  notJoinedChannels: UnsubscribedChannel[];
  recheckChannels: () => Promise<void>;
};

const TelegramUserContext = createContext<TelegramUserContextType | null>(null);

export function TelegramUserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isVerified, setIsVerified] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notJoinedChannels, setNotJoinedChannels] = useState<UnsubscribedChannel[]>([]);

  const doAuth = useCallback(async (initData: string) => {
    const res = await fetch(`${API_BASE}/api/telegram/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data?.user) {
      setUser(data.user);
      setIsVerified(true);
      setIsAdmin(data.isAdmin === true);
      setNotJoinedChannels(Array.isArray(data.notJoinedChannels) ? data.notJoinedChannels : []);
    }
  }, []);

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

    doAuth(initData)
      .catch(err => {
        // Auth call failed — keep showing the initDataUnsafe name (set in Step 1)
        // so the user always sees their real name, never "Miner".
        console.warn('Telegram auth sync failed (showing local name):', err);
      })
      .finally(() => {
        clearTimeout(safetyTimer);
        setIsLoading(false);
      });
  }, [doAuth]);

  /** Re-calls auth endpoint; used by the channel gate "Check again" button. */
  const recheckChannels = useCallback(async () => {
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return;
    await doAuth(initData);
  }, [doAuth]);

  const avatarUrl = user?.id ? `${API_BASE}/api/telegram/avatar/${user.id}` : null;

  return (
    <TelegramUserContext.Provider
      value={{ user, avatarUrl, isVerified, isAdmin, isLoading, notJoinedChannels, recheckChannels }}
    >
      {children}
    </TelegramUserContext.Provider>
  );
}

export function useTelegramUser() {
  const ctx = useContext(TelegramUserContext);
  if (!ctx) throw new Error('useTelegramUser must be used within TelegramUserProvider');
  return ctx;
}

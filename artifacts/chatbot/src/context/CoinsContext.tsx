import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE, getInitData } from '@/lib/telegramApi';
import { useTelegramUser } from './TelegramUserContext';

type CoinsContextType = {
  coins: number;
  loading: boolean;
  spendCoins: (amount: number) => boolean;
  addCoins: (amount: number) => void;
  refreshBalance: () => Promise<void>;
};

const CoinsContext = createContext<CoinsContextType | null>(null);

/** Per-user localStorage key so different Telegram accounts never share the same coin balance. */
function getStorageKey(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? `gram_coins_balance_${tgId}` : 'gram_coins_balance';
}

function loadStoredCoins(): number {
  try {
    const saved = localStorage.getItem(getStorageKey());
    return saved !== null ? Number(saved) : 0;
  } catch {
    return 0;
  }
}

function saveStoredCoins(val: number) {
  try { localStorage.setItem(getStorageKey(), String(val)); } catch { /* ignore */ }
}

export function CoinsProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified } = useTelegramUser();
  const [coins, setCoinsRaw] = useState<number>(loadStoredCoins);
  const [loading, setLoading] = useState(false);

  const setCoins = useCallback((val: number | ((prev: number) => number)) => {
    setCoinsRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      saveStoredCoins(next);
      return next;
    });
  }, []);

  // Keep a stable ref for use in callbacks to avoid stale closures
  const coinsRef = useRef(coins);
  useEffect(() => { coinsRef.current = coins; }, [coins]);

  // Sync coins from server whenever auth resolves (on mount and on every
  // visibility-change re-auth so coins stay fresh after the app is re-opened).
  // Take the max of local & server so any optimistic local deductions (miner
  // purchases that haven't confirmed server-side yet) aren't overwritten.
  const seededFromServer = useRef(false);
  useEffect(() => {
    if (!isVerified || typeof user?.coins !== 'number') return;
    seededFromServer.current = true;
    setCoins(Math.max(loadStoredCoins(), user.coins));
  }, [isVerified, user?.coins, setCoins]);

  const refreshBalance = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/telegram/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });
      if (res.ok) {
        const data = await res.json() as { user?: { coins?: number } };
        if (typeof data.user?.coins === 'number') {
          setCoins(data.user.coins);
        }
      }
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, [setCoins]);

  /**
   * Optimistically deducts coins locally, then syncs with the server in the background.
   * Returns true immediately if balance is sufficient, false otherwise.
   * If the server rejects the deduction, the coins are added back.
   */
  const spendCoins = useCallback((amount: number): boolean => {
    if (coinsRef.current < amount) return false;
    setCoins(prev => prev - amount);

    // Background server sync
    const initData = getInitData();
    if (initData) {
      fetch(`${API_BASE}/api/telegram/coins/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, amount }),
      }).catch(() => {
        // Rollback on network failure — server will be eventually consistent on next auth
        setCoins(prev => prev + amount);
      });
    }
    return true;
  }, [setCoins]);

  const addCoins = useCallback((amount: number) => {
    setCoins(prev => prev + amount);
  }, [setCoins]);

  return (
    <CoinsContext.Provider value={{ coins, loading, spendCoins, addCoins, refreshBalance }}>
      {children}
    </CoinsContext.Provider>
  );
}

export function useCoins() {
  const ctx = useContext(CoinsContext);
  if (!ctx) throw new Error('useCoins must be used within CoinsProvider');
  return ctx;
}

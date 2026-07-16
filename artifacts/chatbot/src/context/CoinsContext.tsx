import React, { createContext, useContext, useEffect, useState } from 'react';

type CoinsContextType = {
  coins: number;
  loading: boolean;
  spendCoins: (amount: number) => boolean;
  addCoins: (amount: number) => void;
  refreshBalance: () => Promise<void>;
};

const CoinsContext = createContext<CoinsContextType | null>(null);
const STORAGE_KEY = 'gram_coins_balance';

export function CoinsProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved !== null ? Number(saved) : 100;
    } catch {
      return 100;
    }
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(coins));
    } catch { /* ignore */ }
  }, [coins]);

  const refreshBalance = async () => {
    setLoading(true);
    // TODO: fetch real balance from API when backend ready
    setLoading(false);
  };

  /** Returns true if deduction succeeded, false if insufficient balance. */
  const spendCoins = (amount: number): boolean => {
    let success = false;
    setCoins(prev => {
      if (prev >= amount) {
        success = true;
        return prev - amount;
      }
      return prev;
    });
    return success;
  };

  const addCoins = (amount: number) => {
    setCoins(prev => prev + amount);
  };

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

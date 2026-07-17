import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { telegramApiPost, API_BASE, getInitData } from '@/lib/telegramApi';
import { useTelegramUser } from './TelegramUserContext';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  referralBalance: number;
  walletAddress: string | null;
  minerLevel: number;
  referralCode: string;
  referralCount: number;
  isClaiming: boolean;
  claimError: string | null;
  claimEarnings: () => void;
  connectWallet: (address: string) => void;
  addReferral: () => void;
  refreshReferrals: () => void;
  addClickEarning: (amount: number) => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

/** Returns a per-user localStorage key so different Telegram accounts
 *  stored on the same device never share the same balance. */
function getLsKey(suffix: string): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? `gmr_${suffix}_${tgId}` : `gmr_${suffix}`;
}

function getStoredBalance(): number {
  try {
    const v = localStorage.getItem(getLsKey('holding_balance'));
    return v !== null ? Number(v) : 0;
  } catch { return 0; }
}

function storeBalance(val: number) {
  try { localStorage.setItem(getLsKey('holding_balance'), String(val)); } catch {}
}

function getStoredWallet(): string | null {
  try { return localStorage.getItem(getLsKey('wallet_address')); } catch { return null; }
}

function storeWallet(addr: string | null) {
  try {
    if (addr) localStorage.setItem(getLsKey('wallet_address'), addr);
    else localStorage.removeItem(getLsKey('wallet_address'));
  } catch {}
}

/** Referral code is just the Telegram user ID (plain number string).
 *  Format: https://t.me/BotName?start=<userId>
 *  This is the canonical format — gram address, no prefix required. */
function generateCode(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? String(tgId) : '';
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified } = useTelegramUser();

  const [holdingWallet, setHoldingWalletRaw] = useState<number>(getStoredBalance);
  const [poolWallet]       = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [walletAddress, setWalletAddressState] = useState<string | null>(getStoredWallet);
  const [minerLevel]     = useState(1);
  const [referralCode]   = useState(() => generateCode());
  const [referralCount, setReferralCount] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Write-through: state + localStorage in sync
  const setHoldingWallet = useCallback((val: number) => {
    storeBalance(val);
    setHoldingWalletRaw(val);
  }, []);

  const connectWallet = useCallback((address: string) => {
    const addr = address || null;
    storeWallet(addr);
    setWalletAddressState(addr);
  }, []);

  // Seed from server balance once verified.
  // The server is always the authoritative source of truth.
  // We only trust localStorage over the server if the difference is small
  // (≤ MAX_UNSYNCED_GRAM) — that margin represents earnings saved locally
  // but not yet flushed to the DB due to a failed network save.
  // If localStorage is much higher than the server, it is almost certainly
  // corrupted (e.g. from a previous bug or repeated aborted-request fallbacks)
  // and we discard it by using the server value.
  const seededFromServer = useRef(false);
  const MAX_UNSYNCED_GRAM = 10; // max plausible unsynced offline earnings
  useEffect(() => {
    if (seededFromServer.current) return;
    if (!isVerified || typeof user?.balance !== 'number') return;
    seededFromServer.current = true;
    const serverBalance = user.balance;
    const storedBalance = getStoredBalance();
    const diff = storedBalance - serverBalance;
    const safeBalance = diff > 0 && diff <= MAX_UNSYNCED_GRAM
      ? storedBalance   // small legitimate offline gap — preserve it
      : serverBalance;  // server wins (stored value is stale or corrupted)
    setHoldingWallet(safeBalance);
    storeBalance(safeBalance); // immediately correct localStorage
  }, [isVerified, user?.balance, setHoldingWallet]);

  // Load referrals from server
  const fetchReferrals = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/referrals`, {
        headers: { 'x-init-data': initData },
      });
      if (!res.ok) return;
      const data = await res.json() as { count: number; reward: number };
      setReferralCount(data.count ?? 0);
      setReferralBalance(data.reward ?? 0);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (isVerified) fetchReferrals();
  }, [isVerified, fetchReferrals]);

  // Passive earnings: +0.001 gram / second
  // Round to 6 d.p. at each tick to prevent IEEE-754 drift accumulating into
  // a distorted floating-point string (e.g. "0.026000000000000002").
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionEarnings(prev => Math.round((prev + 0.001) * 1_000_000) / 1_000_000);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Keep a stable ref to the latest sessionEarnings so async handlers always
  // read the current value without stale-closure issues.
  const sessionEarningsRef = useRef(sessionEarnings);
  useEffect(() => { sessionEarningsRef.current = sessionEarnings; }, [sessionEarnings]);

  // Prevent concurrent saves (auto-save + manual claim racing each other).
  const isSavingRef = useRef(false);

  /**
   * Core persist function — sends `amount` to the server and updates local
   * state on success.  Falls back to localStorage if the API is unavailable
   * so no earnings are silently discarded.
   * Used by both manual claimEarnings and the background auto-save.
   */
  const persistEarnings = useCallback(async (amount: number): Promise<void> => {
    if (amount <= 0 || isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const { balance } = await telegramApiPost<{ balance: number }>('/telegram/claim', { amount });
      setHoldingWallet(balance);
      setSessionEarnings(0);
    } catch {
      // API unavailable — keep earnings in localStorage so they survive a refresh.
      const newBalance = getStoredBalance() + amount;
      setHoldingWallet(newBalance);
      setSessionEarnings(0);
    } finally {
      isSavingRef.current = false;
    }
  }, [setHoldingWallet]);

  /**
   * Auto-save:
   *   1. Every 60 s — so earnings accumulate in the DB while the app is open.
   *   2. On visibilitychange → hidden — catches the moment the user closes the
   *      bot or switches away, ensuring earnings are not lost even if Claim is
   *      never pressed.
   */
  useEffect(() => {
    const save = () => {
      const amount = +sessionEarningsRef.current.toFixed(6);
      if (amount > 0) persistEarnings(amount);
    };

    // Periodic save every 60 seconds
    const interval = setInterval(save, 60_000);

    // Immediate save when the WebApp goes to the background / is closed
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [persistEarnings]);

  const claimEarnings = useCallback(() => {
    const amount = +(poolWallet + sessionEarningsRef.current).toFixed(6);
    if (amount <= 0) return;
    setIsClaiming(true);
    setClaimError(null);
    persistEarnings(amount).finally(() => setIsClaiming(false));
  }, [poolWallet, persistEarnings]);

  const addReferral = () => {
    setReferralCount(prev => prev + 1);
    setReferralBalance(prev => prev + 1);
  };

  const refreshReferrals = () => { fetchReferrals(); };

  /** Add gram earnings from miners — alias for persistEarnings so Miners.tsx can call it directly. */
  const addClickEarning = useCallback((amount: number) => {
    persistEarnings(amount);
  }, [persistEarnings]);

  return (
    <WalletContext.Provider value={{
      holdingWallet, poolWallet, sessionEarnings,
      referralBalance, walletAddress, minerLevel,
      referralCode, referralCount, isClaiming, claimError,
      claimEarnings, connectWallet, addReferral, refreshReferrals, addClickEarning,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

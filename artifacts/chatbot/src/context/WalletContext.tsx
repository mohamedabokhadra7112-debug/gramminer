import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { telegramApiPost } from '@/lib/telegramApi';
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
  addClickEarning: (amount: number) => void;
  claimEarnings: () => void;
  connectWallet: (address: string) => void;
  addReferral: () => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

const LS_BALANCE_KEY = 'gmr_holding_balance';

function getStoredBalance(): number {
  try {
    const v = localStorage.getItem(LS_BALANCE_KEY);
    return v !== null ? Number(v) : 0;
  } catch { return 0; }
}

function storeBalance(val: number) {
  try { localStorage.setItem(LS_BALANCE_KEY, String(val)); } catch {}
}

function generateCode(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId) return `GMR${tgId}`;
  return 'GMR' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified } = useTelegramUser();

  // Start immediately from localStorage — so the user sees their last balance
  // on every open, even before the server responds.
  const [holdingWallet, setHoldingWalletRaw] = useState<number>(getStoredBalance);
  const [poolWallet]       = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [minerLevel]     = useState(1);
  const [referralCode]   = useState(() => generateCode());
  const [referralCount, setReferralCount] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Write-through helper: updates state AND localStorage atomically
  const setHoldingWallet = (val: number) => {
    storeBalance(val);
    setHoldingWalletRaw(val);
  };

  // Once the server-verified user arrives with their persisted balance,
  // adopt it if it's higher than what we have locally (never overwrite
  // a higher local value — user might have clicked many times this session).
  const seededFromServer = useRef(false);
  useEffect(() => {
    if (seededFromServer.current) return;
    if (!isVerified || typeof user?.balance !== 'number') return;
    seededFromServer.current = true;
    // Use the server value only if it's >= local (server is source of truth
    // for persisted balance, but never lose in-progress session gains).
    setHoldingWallet(Math.max(getStoredBalance(), user.balance));
  }, [isVerified, user?.balance]);

  // Passive earnings: +0.001 GMR every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionEarnings(prev => prev + 0.001);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const addClickEarning = (amount: number) => {
    setSessionEarnings(prev => prev + amount);
  };

  const claimEarnings = () => {
    const amount = +(poolWallet + sessionEarnings).toFixed(6);
    if (amount <= 0) return;

    setIsClaiming(true);
    setClaimError(null);

    telegramApiPost<{ balance: number }>('/telegram/claim', { amount })
      .then(({ balance }) => {
        // Server confirms new total — update state + localStorage
        setHoldingWallet(balance);
        setSessionEarnings(0);
      })
      .catch(err => {
        console.error('Claim API failed, saving locally:', err);
        // Graceful degradation: persist locally so earnings aren't lost
        const newBalance = getStoredBalance() + amount;
        setHoldingWallet(newBalance);
        setSessionEarnings(0);
        // Don't show an error — the user's coins are saved, just locally
      })
      .finally(() => setIsClaiming(false));
  };

  const connectWallet = (address: string) => {
    setWalletAddress(address || null);
  };

  const addReferral = () => {
    setReferralCount(prev => prev + 1);
    setReferralBalance(prev => prev + 0.01);
  };

  return (
    <WalletContext.Provider value={{
      holdingWallet, poolWallet, sessionEarnings,
      referralBalance, walletAddress, minerLevel,
      referralCode, referralCount, isClaiming, claimError,
      addClickEarning, claimEarnings, connectWallet, addReferral,
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

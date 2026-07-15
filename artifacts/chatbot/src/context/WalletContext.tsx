import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { telegramApiPost } from '@/lib/telegramApi';
import { useTelegramUser } from './TelegramUserContext';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  referralBalance: number; // غير قابل للسحب — للشراء بس
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

function generateCode(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  if (tgId) return `GMR${tgId}`;
  return 'GMR' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified } = useTelegramUser();
  const [holdingWallet, setHoldingWallet] = useState(0);
  const [poolWallet, setPoolWallet] = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [minerLevel] = useState(1);
  const [referralCode] = useState(() => generateCode());
  const [referralCount, setReferralCount] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Seed the holding wallet exactly once from the DB-persisted balance
  // returned by /telegram/auth, once the verified user (and their balance)
  // becomes available. Guarded by a ref so it never overwrites in-progress
  // local session earnings on later re-renders.
  const seededFromServer = useRef(false);
  useEffect(() => {
    if (seededFromServer.current) return;
    if (!isVerified || typeof user?.balance !== 'number') return;
    seededFromServer.current = true;
    setHoldingWallet(user.balance);
  }, [isVerified, user?.balance]);

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
    const amount = poolWallet + sessionEarnings;
    if (amount <= 0) return;

    // Persist first: only clear the pending pool/session once the Backend
    // confirms the new balance, so a network failure never silently loses
    // the user's earnings.
    setIsClaiming(true);
    setClaimError(null);
    telegramApiPost<{ balance: number }>('/telegram/claim', { amount })
      .then(({ balance }) => {
        setHoldingWallet(balance);
        setPoolWallet(0);
        setSessionEarnings(0);
      })
      .catch(err => {
        console.error('Failed to persist claim', err);
        setClaimError('claim_failed');
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
      addClickEarning, claimEarnings, connectWallet, addReferral
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

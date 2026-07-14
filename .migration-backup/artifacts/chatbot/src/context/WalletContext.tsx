import React, { createContext, useContext, useState, useEffect } from 'react';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  referralBalance: number; // غير قابل للسحب — للشراء بس
  walletAddress: string | null;
  minerLevel: number;
  referralCode: string;
  referralCount: number;
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
  const [holdingWallet, setHoldingWallet] = useState(0);
  const [poolWallet, setPoolWallet] = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [minerLevel] = useState(1);
  const [referralCode] = useState(() => generateCode());
  const [referralCount, setReferralCount] = useState(0);

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
    setHoldingWallet(prev => prev + poolWallet + sessionEarnings);
    setPoolWallet(0);
    setSessionEarnings(0);
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
      referralCode, referralCount,
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

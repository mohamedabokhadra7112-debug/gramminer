import React, { createContext, useContext, useState, useEffect } from 'react';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  addClickEarning: (amount: number) => void;
  claimEarnings: () => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [holdingWallet, setHoldingWallet] = useState(1157.141);
  const [poolWallet, setPoolWallet] = useState(429.8584);
  const [sessionEarnings, setSessionEarnings] = useState(1.9063);

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

  return (
    <WalletContext.Provider value={{ holdingWallet, poolWallet, sessionEarnings, addClickEarning, claimEarnings }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

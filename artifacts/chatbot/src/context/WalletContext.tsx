import React, { createContext, useContext, useState, useEffect } from 'react';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  walletAddress: string | null;
  minerLevel: number;
  addClickEarning: (amount: number) => void;
  claimEarnings: () => void;
  connectWallet: (address: string) => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [holdingWallet, setHoldingWallet] = useState(0);
  const [poolWallet, setPoolWallet] = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [minerLevel] = useState(1); // الكل بيبدأ بجهاز رقم 1

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
    setWalletAddress(address);
  };

  return (
    <WalletContext.Provider value={{
      holdingWallet, poolWallet, sessionEarnings,
      walletAddress, minerLevel,
      addClickEarning, claimEarnings, connectWallet
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

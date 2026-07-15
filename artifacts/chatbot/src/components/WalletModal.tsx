import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWallet } from '@/context/WalletContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function WalletModal({ onClose }: { onClose: () => void }) {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { connectWallet, walletAddress } = useWallet();

  // Sync TON wallet address → WalletContext whenever it changes
  useEffect(() => {
    if (tonWallet?.account?.address) {
      connectWallet(tonWallet.account.address);
    }
  }, [tonWallet?.account?.address, connectWallet]);

  const handleConnect = () => {
    tonConnectUI.openModal();
  };

  const handleDisconnect = async () => {
    await tonConnectUI.disconnect();
    connectWallet('');
    onClose();
  };

  const connected = Boolean(tonWallet?.account?.address || walletAddress);
  const displayAddress = tonWallet?.account?.address || walletAddress;

  // Ultra-short: first 2 chars + "..." + last 2 chars  →  "0:...9a"
  const shortAddr = displayAddress
    ? displayAddress.slice(0, 2) + '...' + displayAddress.slice(-2)
    : '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center">
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-black/70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Sheet — slides up from the bottom */}
        <motion.div
          className="relative w-full max-w-[430px] bg-[#0f0f1a] rounded-t-3xl p-6 border-t border-white/10"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        >
          {/* Handle bar */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/20 rounded-full" />

          {/* Header */}
          <div className="flex items-center justify-between mb-5 mt-2">
            <h2 className="text-xl font-black text-white">ربط المحفظة</h2>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {connected ? (
            <div className="text-center py-2 space-y-3">
              <div className="text-success text-lg font-bold">✅ المحفظة متربطة</div>

              {/* Short address display */}
              <div className="bg-black/40 rounded-xl px-4 py-2 inline-block border border-success/20">
                <span className="text-success font-mono text-base font-bold tracking-wider">{shortAddr}</span>
              </div>

              {tonWallet?.device?.appName && (
                <div className="text-xs text-muted-foreground/70">{tonWallet.device.appName}</div>
              )}

              {/* Disconnect — clearly red-accented */}
              <button
                onClick={handleDisconnect}
                className="w-full mt-2 py-3 rounded-xl border-2 border-red-500/60 bg-red-500/10 text-red-400 font-black text-sm hover:bg-red-500/20 transition-colors"
              >
                🔌 إلغاء ربط المحفظة
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                اختر محفظتك للاتصال بـ GramMiner
              </p>

              {/* TON Connect button */}
              <button
                onClick={handleConnect}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-primary/30 hover:border-primary/60 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl">💎</span>
                </div>
                <div className="text-left">
                  <div className="font-bold text-white">TON Connect</div>
                  <div className="text-xs text-muted-foreground">
                    Tonkeeper · Telegram Wallet · MyTonWallet · وغيرها
                  </div>
                </div>
              </button>

              <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
                يتم ربط المحفظة بشكل آمن عبر TON Connect الرسمي
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

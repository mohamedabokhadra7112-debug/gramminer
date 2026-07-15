import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { useWallet } from '@/context/WalletContext';

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
  const shortAddr = displayAddress
    ? displayAddress.slice(0, 6) + '...' + displayAddress.slice(-4)
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-[#0f0f1a] rounded-t-3xl p-6 border-t border-white/10">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-white">ربط المحفظة</h2>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {connected ? (
          <div className="text-center py-4">
            <div className="text-success text-lg font-bold mb-2">✅ المحفظة متربطة</div>
            <div className="text-muted-foreground font-mono text-sm mb-1">{shortAddr}</div>
            {tonWallet?.device?.appName && (
              <div className="text-xs text-muted-foreground/60 mb-4">{tonWallet.device.appName}</div>
            )}
            <button
              onClick={handleDisconnect}
              className="mt-2 px-6 py-2 rounded-xl bg-destructive/20 text-destructive font-bold text-sm"
            >
              فصل المحفظة
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground text-center mb-4">
              اختر محفظتك للاتصال بـ GramMiner
            </p>

            {/* TON Connect — opens the official wallet picker */}
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
      </div>
    </div>
  );
}

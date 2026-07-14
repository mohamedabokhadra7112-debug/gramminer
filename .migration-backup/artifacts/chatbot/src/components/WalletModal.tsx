import { useState } from 'react';
import { X, Wallet, Key } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';

export default function WalletModal({ onClose }: { onClose: () => void }) {
  const { connectWallet, walletAddress } = useWallet();
  const [step, setStep] = useState<'choose' | 'seed'>('choose');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState('');

  const handleSeedConnect = () => {
    const words = seed.trim().split(/\s+/);
    if (words.length !== 12) {
      setError('لازم تكتب 12 كلمة بالظبط');
      return;
    }
    // محاكاة توليد عنوان محفظة
    const fakeAddress = 'UQ' + Math.random().toString(36).substring(2, 8).toUpperCase() + '...' + Math.random().toString(36).substring(2, 6).toUpperCase();
    connectWallet(fakeAddress);
    onClose();
  };

  const handleTelegramWallet = () => {
    const fakeAddress = 'UQ' + Math.random().toString(36).substring(2, 8).toUpperCase() + '...' + Math.random().toString(36).substring(2, 6).toUpperCase();
    connectWallet(fakeAddress);
    onClose();
  };

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

        {walletAddress ? (
          <div className="text-center py-4">
            <div className="text-success text-lg font-bold mb-2">✅ المحفظة متربطة</div>
            <div className="text-muted-foreground font-mono text-sm">{walletAddress}</div>
            <button
              onClick={() => { connectWallet(''); onClose(); }}
              className="mt-4 px-6 py-2 rounded-xl bg-destructive/20 text-destructive font-bold text-sm"
            >
              فصل المحفظة
            </button>
          </div>
        ) : step === 'choose' ? (
          <div className="space-y-3">
            {/* Telegram Wallet */}
            <button
              onClick={handleTelegramWallet}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-white/5 hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <span className="text-2xl">✈️</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-white">Telegram Wallet</div>
                <div className="text-xs text-muted-foreground">ربط عن طريق محفظة تلجرام</div>
              </div>
            </button>

            {/* TON Keeper */}
            <button
              onClick={() => setStep('seed')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl bg-secondary/60 border border-white/5 hover:border-primary/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                <span className="text-2xl">💎</span>
              </div>
              <div className="text-left">
                <div className="font-bold text-white">TON Keeper</div>
                <div className="text-xs text-muted-foreground">ربط عن طريق الـ 12 كلمة السرية</div>
              </div>
            </button>
          </div>
        ) : (
          <div>
            <button onClick={() => setStep('choose')} className="text-primary text-sm mb-4">← رجوع</button>
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-white">ادخل الـ 12 كلمة السرية</span>
              </div>
              <textarea
                value={seed}
                onChange={e => { setSeed(e.target.value); setError(''); }}
                placeholder="اكتب الـ 12 كلمة مفصولة بمسافات..."
                rows={4}
                className="w-full bg-secondary/60 border border-white/10 rounded-xl p-3 text-white text-sm resize-none focus:outline-none focus:border-primary/50"
              />
              {error && <p className="text-destructive text-xs mt-1">{error}</p>}
            </div>
            <button
              onClick={handleSeedConnect}
              className="w-full py-3 rounded-xl bg-primary text-black font-black"
            >
              ربط المحفظة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

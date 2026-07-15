import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import WalletModal from '@/components/WalletModal';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import gramCoinImg from '@/assets/gram-coin.png';

export default function Dashboard() {
  const { holdingWallet, poolWallet, sessionEarnings, walletAddress, minerLevel, addClickEarning, claimEarnings } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const [clicks, setClicks] = useState<{ id: number; x: number; y: number }[]>([]);
  const [showWallet, setShowWallet] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const userName = tgUser?.first_name || 'Miner';
  const userInitial = userName[0].toUpperCase();
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  const totalAssets = holdingWallet + poolWallet + sessionEarnings;

  // Short address: first 2 chars + "..." + last 2 chars  (e.g. "0:...9a")
  const shortAddress = walletAddress
    ? walletAddress.slice(0, 2) + '...' + walletAddress.slice(-2)
    : null;

  const playMiningTone = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  };

  const handleCoinClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    setClicks(prev => [...prev, { id: Date.now() + Math.random(), x, y }]);
    addClickEarning(0.001);
    playMiningTone();
  };

  const handleAnimationEnd = (id: number) => {
    setClicks(prev => prev.filter(click => click.id !== id));
  };

  return (
    <div className="min-h-full flex flex-col relative w-full">
      {/* Dark overlay */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.50)' }} />

      {/* User Card — first visible element, no top bar above it */}
      <div className="px-4 pt-3 relative z-10">
        <div className="bg-secondary/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 relative overflow-hidden">
              {showAvatar ? (
                <img
                  src={avatarUrl!}
                  alt={userName}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="font-bold text-primary">{userInitial}</span>
              )}
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-background rounded-full flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-white">{userName}</div>
              <div className="text-xs text-primary font-bold">Lvl {minerLevel}</div>
            </div>
          </div>

          {/* Wallet Button */}
          <button
            onClick={() => setShowWallet(true)}
            className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 hover:border-primary/30 transition-colors"
          >
            <span className={`text-xs font-mono ${walletAddress ? 'text-success' : 'text-primary'}`}>
              {shortAddress ?? 'ربط المحفظة'}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Balances — tighter spacing */}
      <div className="flex flex-col items-center mt-3 relative z-10 px-4">
        <div className="text-[clamp(1.5rem,7vw,2rem)] font-black text-white mb-2 text-center px-2">
          {totalAssets.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} GMR
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          {/* Holding Wallet — ~25% shorter vertically */}
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-1.5 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">HOLDING WALLET</div>
            <div className="text-sm font-bold text-white">
              {holdingWallet.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} GMR
            </div>
          </div>
        </div>
      </div>

      {/* Session Earnings — tighter */}
      <div className="flex justify-center mt-3 relative z-10">
        <div className="text-[clamp(2rem,9vw,3rem)] font-black text-success glow-text-success tabular-nums">
          +{sessionEarnings.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
        </div>
      </div>

      {/* The Big Coin */}
      <div className="flex-1 flex items-center justify-center relative z-10 mt-2 mb-2">
        <div
          className="relative w-[min(260px,58vw)] h-[min(260px,58vw)] rounded-full coin-edge p-[3px] cursor-pointer touch-manipulation shadow-2xl active:scale-95 transition-transform duration-100"
          onClick={handleCoinClick}
          onTouchStart={handleCoinClick}
        >
          <div className="w-full h-full rounded-full coin-gradient flex items-center justify-center relative overflow-hidden border-2 border-[#ffeca8]/30">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/20 to-transparent rounded-full transform -rotate-45"></div>
            <div className="text-[clamp(2.2rem,9vw,3.25rem)] font-black text-[#3a2200] relative z-10 tracking-tighter">
              GRAM
            </div>
          </div>

          <AnimatePresence>
            {clicks.map(click => (
              <motion.div
                key={click.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -120, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                onAnimationComplete={() => handleAnimationEnd(click.id)}
                className="absolute text-2xl font-bold text-white pointer-events-none select-none drop-shadow-md z-50"
                style={{ left: click.x, top: click.y, transform: 'translate(-50%, -50%)' }}
              >
                +0.001
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Claim Button — tighter bottom */}
      <div className="px-6 mb-4 relative z-10">
        <button
          onClick={claimEarnings}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#f5a623] to-[#ffd700] text-black font-black text-xl shadow-[0_0_20px_rgba(245,166,35,0.4)] hover:shadow-[0_0_30px_rgba(245,166,35,0.6)] active:scale-95 transition-all"
        >
          CLAIM
        </button>
      </div>

      {/* Wallet Modal */}
      {showWallet && <WalletModal onClose={() => setShowWallet(false)} />}
    </div>
  );
}

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import CandlestickBg from '@/components/CandlestickBg';
import { X, ChevronDown, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const { holdingWallet, poolWallet, sessionEarnings, addClickEarning, claimEarnings } = useWallet();
  const [clicks, setClicks] = useState<{ id: number; x: number; y: number }[]>([]);

  const totalAssets = holdingWallet + poolWallet + sessionEarnings;

  const handleCoinClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    // Only prevent default on touch, mouse will be fine
    if ('touches' in e) {
      // Do not prevent default as React synthetic event doesn't require it for simple taps
    }
    
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
  };

  const handleAnimationEnd = (id: number) => {
    setClicks(prev => prev.filter(click => click.id !== id));
  };

  return (
    <div className="min-h-full flex flex-col relative w-full overflow-hidden">
      <CandlestickBg />
      
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 relative z-10">
        <button className="p-2 text-muted-foreground hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="font-black text-xl tracking-widest text-white">ATF</div>
        <div className="flex items-center gap-1">
          <button className="p-2 text-muted-foreground hover:text-white transition-colors">
            <ChevronDown className="w-5 h-5" />
          </button>
          <button className="p-2 text-muted-foreground hover:text-white transition-colors">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* User Card */}
      <div className="px-4 relative z-10">
        <div className="bg-secondary/40 backdrop-blur-sm border border-white/5 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 relative">
              <span className="font-bold text-primary">M</span>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-background rounded-full flex items-center justify-center">
                <div className="w-2.5 h-2.5 bg-success rounded-full animate-pulse shadow-[0_0_8px_rgba(0,255,136,0.8)]" />
              </div>
            </div>
            <div>
              <div className="font-semibold text-white">Mohamed</div>
              <div className="text-xs text-primary font-bold">Lvl 12</div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/5">
            <span className="text-xs text-muted-foreground font-mono">UQCc...9bjv</span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Balances */}
      <div className="flex flex-col items-center mt-6 relative z-10 px-4">
        <div className="text-xs font-semibold text-muted-foreground tracking-widest mb-1">ASSETS</div>
        <div className="text-[32px] font-black text-white mb-4">
          {totalAssets.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ATF
        </div>
        
        <div className="flex gap-2 w-full max-w-sm">
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-2 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">HOLDING WALLET</div>
            <div className="text-sm font-bold text-white">
              {holdingWallet.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ATF
            </div>
          </div>
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-2 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">POOL WALLET</div>
            <div className="text-sm font-bold text-white">
              {poolWallet.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ATF
            </div>
          </div>
        </div>
      </div>

      {/* Session Earnings */}
      <div className="flex justify-center mt-6 relative z-10">
        <div className="text-5xl font-black text-success glow-text-success tabular-nums">
          +{sessionEarnings.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
        </div>
      </div>

      {/* The Big Coin */}
      <div className="flex-1 flex items-center justify-center relative z-10 mt-2 mb-2">
        <motion.div 
          className="relative w-[280px] h-[280px] rounded-full coin-edge p-[3px] cursor-pointer touch-manipulation shadow-2xl"
          whileTap={{ scale: 0.95 }}
          onClick={handleCoinClick}
          onTouchStart={handleCoinClick}
        >
          <div className="w-full h-full rounded-full coin-gradient flex items-center justify-center relative overflow-hidden border-2 border-[#ffeca8]/30">
            {/* Inner detail ring */}
            <div className="absolute inset-4 rounded-full border-[3px] border-dashed border-[#b87300]/50"></div>
            
            {/* Glossy reflection */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/20 to-transparent rounded-full transform -rotate-45"></div>
            
            {/* Coin Text */}
            <div className="text-7xl font-black text-[#ffd700] drop-shadow-[0_4px_4px_rgba(0,0,0,0.4)] relative z-10 tracking-tighter" style={{ textShadow: '0 3px 0 #b87300, 0 6px 12px rgba(0,0,0,0.5)' }}>
              ATF
            </div>
          </div>

          {/* Floating Numbers */}
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
        </motion.div>
      </div>

      {/* Claim Button */}
      <div className="px-6 mb-6 relative z-10">
        <button 
          onClick={claimEarnings}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#f5a623] to-[#ffd700] text-black font-black text-xl shadow-[0_0_20px_rgba(245,166,35,0.4)] hover:shadow-[0_0_30px_rgba(245,166,35,0.6)] active:scale-95 transition-all"
        >
          CLAIM
        </button>
      </div>
    </div>
  );
}

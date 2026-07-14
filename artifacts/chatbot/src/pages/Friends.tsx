import CandlestickBg from '@/components/CandlestickBg';
import { Users, Copy, Share2 } from 'lucide-react';

export default function Friends() {
  return (
    <div className="min-h-full flex flex-col relative w-full overflow-hidden px-4 pt-6">
      <CandlestickBg />
      
      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">FRIENDS</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <Users className="text-primary w-6 h-6" />
        </div>
      </div>
      
      <div className="relative z-10 bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-3xl p-6 mb-6 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mb-5 rotate-3 shadow-[0_0_20px_rgba(245,166,35,0.2)]">
          <Users className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Invite Friends!</h2>
        <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
          You and your friend will receive <span className="text-primary font-bold">100 ATF</span> each when they join through your link.
        </p>
        
        <div className="w-full flex gap-3">
          <button className="flex-1 py-3.5 rounded-xl bg-primary text-black font-black flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,166,35,0.3)]">
            <Share2 className="w-5 h-5" /> SHARE LINK
          </button>
          <button className="p-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
            <Copy className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="relative z-10 flex-1">
        <h3 className="text-xs font-black text-muted-foreground mb-4 px-2 tracking-widest">YOUR REFERRALS (0)</h3>
        <div className="flex flex-col items-center justify-center h-40 bg-secondary/30 rounded-2xl border border-white/5 border-dashed">
          <Users className="w-8 h-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No friends yet</p>
        </div>
      </div>
    </div>
  );
}

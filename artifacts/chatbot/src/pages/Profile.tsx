import { useState } from 'react';
import CandlestickBg from '@/components/CandlestickBg';
import { Settings, Wallet, Activity, Shield, LogOut } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';

export default function Profile() {
  const { minerLevel, walletAddress } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const [avatarFailed, setAvatarFailed] = useState(false);

  const userName = tgUser?.first_name
    ? `${tgUser.first_name}${tgUser.last_name ? ` ${tgUser.last_name}` : ''}`
    : 'Miner';
  const userInitial = userName[0].toUpperCase();
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <CandlestickBg />
      
      <div className="relative z-10 flex flex-col items-center mt-2 mb-8">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/50 relative mb-5 shadow-[0_0_20px_rgba(245,166,35,0.2)] overflow-hidden">
          {showAvatar ? (
            <img
              src={avatarUrl!}
              alt={userName}
              className="w-full h-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            <span className="font-black text-4xl text-primary">{userInitial}</span>
          )}
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-success rounded-full border-2 border-background shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">{userName}</h1>
        <div className="text-sm text-primary font-black mt-1 uppercase tracking-widest">Level {minerLevel}</div>
        <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono font-medium text-muted-foreground mt-4">
          {walletAddress || 'No wallet connected'}
        </div>
      </div>
      
      <div className="relative z-10 flex-1 space-y-3">
        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Wallet className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">Wallet Connection</div>
            <div className="text-xs text-muted-foreground">Manage connected wallets</div>
          </div>
        </div>
        
        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">Mining Stats</div>
            <div className="text-xs text-muted-foreground">View detailed analytics</div>
          </div>
        </div>

        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">Security</div>
            <div className="text-xs text-muted-foreground">2FA and recovery options</div>
          </div>
        </div>

        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Settings className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">Settings</div>
            <div className="text-xs text-muted-foreground">App preferences</div>
          </div>
        </div>

        <div className="mt-8 flex justify-center pb-8 pt-4">
          <button className="flex items-center gap-2 text-destructive font-bold py-3 px-6 rounded-xl hover:bg-destructive/10 transition-colors">
            <LogOut className="w-5 h-5" /> Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

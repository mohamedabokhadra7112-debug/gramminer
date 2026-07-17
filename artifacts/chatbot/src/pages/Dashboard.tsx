import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage } from '@/context/LanguageContext';
import WalletModal from '@/components/WalletModal';
import { ChevronDown } from 'lucide-react';
import gramCoinImg from '@/assets/gram-coin.png';
import { API_BASE, getInitData } from '@/lib/telegramApi';

export default function Dashboard() {
  const { holdingWallet, poolWallet, sessionEarnings, walletAddress, minerLevel, isClaiming, claimError, claimEarnings } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const { t } = useLanguage();
  const [showWallet, setShowWallet] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [earnings24h, setEarnings24h] = useState<number | null>(null);

  const userName = tgUser?.first_name || 'Miner';
  const userInitial = userName[0].toUpperCase();
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  const totalAssets = holdingWallet + poolWallet + sessionEarnings;

  const shortAddress = walletAddress
    ? walletAddress.slice(0, 2) + '...' + walletAddress.slice(-2)
    : null;

  const fetch24hEarnings = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/earnings/24h`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json() as { earnings?: number };
        if (typeof data.earnings === 'number') {
          setEarnings24h(data.earnings);
        }
      }
    } catch { /* best-effort */ }
  }, []);

  // Fetch on mount
  useEffect(() => { fetch24hEarnings(); }, [fetch24hEarnings]);

  // Re-fetch whenever a claim finishes (isClaiming transitions true → false)
  const prevIsClaiming = useRef(false);
  useEffect(() => {
    if (prevIsClaiming.current && !isClaiming) {
      fetch24hEarnings();
    }
    prevIsClaiming.current = isClaiming;
  }, [isClaiming, fetch24hEarnings]);

  return (
    <div className="min-h-full flex flex-col relative w-full">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.50)' }} />

      {/* User Card */}
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
              <div className="text-xs text-primary font-bold">{t('dashboard_level')} {minerLevel}</div>
            </div>
          </div>

          <button
            onClick={() => setShowWallet(true)}
            className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-white/10 hover:border-primary/30 transition-colors"
          >
            <span className={`text-xs font-mono ${walletAddress ? 'text-success' : 'text-primary'}`}>
              {shortAddress ?? t('dashboard_connect_wallet')}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Balances */}
      <div className="flex flex-col items-center mt-3 relative z-10 px-4">
        <div className="text-[clamp(1.5rem,7vw,2rem)] font-black text-white mb-2 text-center px-2">
          {totalAssets.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gram
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          {/* Holding wallet */}
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-1.5 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">{t('dashboard_holding_wallet')}</div>
            <div className="text-sm font-bold text-white">
              {holdingWallet.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} gram
            </div>
          </div>
          {/* 24-hour earnings */}
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-1.5 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">{t('dashboard_24h_label')}</div>
            <div className="text-sm font-bold text-success">
              {earnings24h !== null
                ? `+${earnings24h.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} gram`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Session Earnings */}
      <div className="flex justify-center mt-3 relative z-10">
        <div className="text-[clamp(2rem,9vw,3rem)] font-black text-success glow-text-success tabular-nums">
          +{sessionEarnings.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
        </div>
      </div>

      {/* The Big Coin */}
      <div className="flex-1 flex items-center justify-center relative z-10 mt-2 mb-2">
        <div
          className="relative w-[min(260px,58vw)] h-[min(260px,58vw)] rounded-full coin-edge p-[3px] shadow-2xl"
        >
          <div className="w-full h-full rounded-full coin-gradient flex items-center justify-center relative overflow-hidden border-2 border-[#ffeca8]/30">
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 via-white/20 to-transparent rounded-full transform -rotate-45"></div>
            <div className="text-[clamp(2.2rem,9vw,3.25rem)] font-black text-[#3a2200] relative z-10 tracking-tighter">
              gram
            </div>
          </div>

        </div>
      </div>

      {/* Claim Button */}
      <div className="px-6 mb-4 relative z-10">
        <button
          onClick={claimEarnings}
          disabled={isClaiming}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#f5a623] to-[#ffd700] text-black font-black text-xl shadow-[0_0_20px_rgba(245,166,35,0.4)] hover:shadow-[0_0_30px_rgba(245,166,35,0.6)] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isClaiming ? '...' : t('dashboard_claim')}
        </button>
        {claimError && (
          <div className="text-center text-xs text-destructive mt-2">{t('dashboard_claim_failed')}</div>
        )}
      </div>

      {showWallet && <WalletModal onClose={() => setShowWallet(false)} />}
    </div>
  );
}

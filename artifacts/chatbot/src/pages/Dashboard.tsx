import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useMiners } from '@/context/MinersContext';
import WalletModal from '@/components/WalletModal';
import { ChevronDown } from 'lucide-react';
import { formatGram } from '@/lib/utils';
import gramLogoImg from '@assets/IMG_20260717_131358_656_1784283967558.jpg';

export default function Dashboard() {
  const { holdingWallet, poolWallet, sessionEarnings, walletAddress, minerLevel, isClaiming, claimError, claimEarnings } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const { t } = useLanguage();
  const { dailyProjection } = useMiners();
  const [showWallet, setShowWallet] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const userName    = tgUser?.first_name || 'Miner';
  const userInitial = userName[0].toUpperCase();
  const showAvatar  = Boolean(avatarUrl) && !avatarFailed;

  // Each operand is clamped to 0 if non-finite before summing.
  // setHoldingWallet already guards NaN, but we add a second layer here so
  // a stale React render before the guard fires never flashes "NaN gram".
  const hw = Number.isFinite(holdingWallet)   ? holdingWallet   : 0;
  const pw = Number.isFinite(poolWallet)       ? poolWallet       : 0;
  const se = Number.isFinite(sessionEarnings)  ? sessionEarnings  : 0;
  const totalAssets = Math.round((hw + pw + se) * 1_000_000) / 1_000_000;

  const shortAddress = walletAddress
    ? walletAddress.slice(0, 2) + '...' + walletAddress.slice(-2)
    : null;

  // Detect when a claim finishes (isClaiming: true → false).
  // No longer needed for 24h fetch, kept in case we want to re-sync in future.
  const prevIsClaiming = useRef(false);
  useEffect(() => {
    prevIsClaiming.current = isClaiming;
  }, [isClaiming]);

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
        {/* Total — round first to prevent floating-point drift appearing as raw JS number */}
        <div className="text-[clamp(1.5rem,7vw,2rem)] font-black text-white mb-2 text-center px-2">
          {formatGram(totalAssets, 4)} gram
        </div>
        <div className="flex gap-2 w-full max-w-sm">
          {/* Holding wallet */}
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-1.5 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">{t('dashboard_holding_wallet')}</div>
            <div className="text-sm font-bold text-white">
              {formatGram(holdingWallet, 3)} gram
            </div>
          </div>
          {/* Projected 24-hour earnings from owned miners */}
          <div className="flex-1 bg-secondary/50 backdrop-blur-sm border border-white/5 rounded-xl py-1.5 px-3 text-center">
            <div className="text-[10px] text-muted-foreground font-semibold mb-0.5">{t('dashboard_24h_label')}</div>
            <div className="text-sm font-bold text-success">
              {dailyProjection > 0
                ? `+${formatGram(dailyProjection, 4)} gram`
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Session Earnings */}
      <div className="flex justify-center mt-3 relative z-10">
        <div className="text-[clamp(2rem,9vw,3rem)] font-black text-success glow-text-success tabular-nums">
          +{formatGram(sessionEarnings, 4)}
        </div>
      </div>

      {/* The Big Logo */}
      <div className="flex-1 flex items-center justify-center relative z-10 mt-2 mb-2">
        {/* Circular clip — crops the rectangular background of the photo */}
        <div
          className="rounded-full overflow-hidden"
          style={{
            width:  'min(260px, 62vw)',
            height: 'min(260px, 62vw)',
            boxShadow: '0 0 48px 8px rgba(255,220,100,0.25), 0 0 0 2px rgba(255,220,100,0.15)',
          }}
        >
          <img
            src={gramLogoImg}
            alt="gram"
            className="w-full h-full object-cover"
            style={{ objectPosition: 'center 35%' }}
          />
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

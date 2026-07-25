import { Users, Copy, Share2, CheckCircle2, RefreshCw, Gift, Star, X, Trophy, Clock } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE, getInitData } from '@/lib/telegramApi';

const BOT_USERNAME = 'GramCoin11_bot';
const LEADERBOARD_ICON = 'https://vynex-coin1.vercel.app/sad-icon.png';

interface Milestone {
  id: number;
  inviteCount: number;
  rewardCoins: number;
  isEnabled: boolean;
  reached: boolean;
  credited: boolean;
}

interface ReferralData {
  count: number;
  reward: number;
  milestones: Milestone[];
  progress: number;
}

interface LeaderUser {
  rank: number;
  telegramId: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  balance: number;
}

interface TournamentPrize { rank: number; gram: number }
interface ActiveTournament {
  id: number;
  title: string;
  topN: number;
  prizes: TournamentPrize[];
  startsAt: string;
  endsAt: string;
  status: string;
}

/** Countdown hook — returns formatted string, updates every second */
function useCountdown(endsAt: string | undefined) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setLabel('انتهت'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setLabel(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);
  return label;
}

function AvatarImg({ telegramId, name }: { telegramId: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name?.charAt(0)?.toUpperCase() || '?';

  if (failed) {
    return (
      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <span className="text-primary font-black text-sm">{initial}</span>
      </div>
    );
  }
  return (
    <img
      src={`${API_BASE}/api/telegram/avatar/${telegramId}`}
      alt={name}
      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

function LeaderboardModal({
  onClose,
  leaderboard,
  loading,
}: {
  onClose: () => void;
  leaderboard: LeaderUser[];
  loading: boolean;
}) {
  const rankIcon = (r: number) => {
    if (r === 1) return '🥇';
    if (r === 2) return '🥈';
    if (r === 3) return '🥉';
    return r;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="relative z-10 rounded-t-3xl flex flex-col"
        style={{
          backgroundColor: '#0a0b14',
          maxHeight: '88vh',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <img src={LEADERBOARD_ICON} alt="" className="w-7 h-7 object-contain" />
            <h2 className="text-xl font-black text-white">المتصدرون</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* Subtitle */}
        <p className="text-xs text-white/40 px-5 pb-3 font-medium">أفضل 20 مستخدم بالرصيد الأعلى</p>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 pb-8 space-y-2">
          {loading ? (
            <div className="flex justify-center py-14">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-white/40">
              <img src={LEADERBOARD_ICON} alt="" className="w-14 h-14 object-contain opacity-30 mb-3" />
              <p className="text-sm font-semibold">لا توجد بيانات بعد</p>
            </div>
          ) : (
            leaderboard.map((u) => {
              const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Miner';
              return (
                <div
                  key={u.telegramId}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5 border border-white/8"
                  style={{
                    backgroundColor:
                      u.rank === 1
                        ? 'rgba(255,215,0,0.06)'
                        : u.rank === 2
                        ? 'rgba(192,192,192,0.06)'
                        : u.rank === 3
                        ? 'rgba(205,127,50,0.06)'
                        : 'rgba(0,0,0,0.45)',
                    borderColor:
                      u.rank === 1
                        ? 'rgba(255,215,0,0.25)'
                        : u.rank === 2
                        ? 'rgba(192,192,192,0.18)'
                        : u.rank === 3
                        ? 'rgba(205,127,50,0.22)'
                        : 'rgba(255,255,255,0.07)',
                  }}
                >
                  {/* Rank */}
                  <div className="w-8 text-center flex-shrink-0">
                    {u.rank <= 3 ? (
                      <span className="text-lg leading-none">{rankIcon(u.rank)}</span>
                    ) : (
                      <span className="text-sm font-black text-white/40">{u.rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <AvatarImg telegramId={u.telegramId} name={displayName} />

                  {/* Name + username */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{displayName}</div>
                    {u.username ? (
                      <div className="text-[11px] text-white/45 truncate">@{u.username}</div>
                    ) : (
                      <div className="text-[11px] text-white/25 truncate">#{u.telegramId}</div>
                    )}
                  </div>

                  {/* Balance */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-black text-primary">
                      {u.balance.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-white/40 font-semibold">gram</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function Friends() {
  const { referralCode, referralCount, referralBalance, refreshReferrals } = useWallet();
  const { user: tgUser } = useTelegramUser();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [milestoneData, setMilestoneData] = useState<ReferralData | null>(null);

  // Leaderboard state
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderUser[]>([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  const referralLink = `https://t.me/${BOT_USERNAME}?start=${tgUser?.id ?? referralCode}`;

  const loadMilestones = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/referrals`, {
        headers: { 'x-init-data': initData },
      });
      if (res.ok) {
        const data = await res.json() as ReferralData;
        setMilestoneData(data);
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { loadMilestones(); }, [loadMilestones]);

  const loadLeaderboard = useCallback(async () => {
    setLoadingLeaderboard(true);
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard`);
      if (res.ok) setLeaderboard(await res.json() as LeaderUser[]);
    } catch { /* best-effort */ }
    finally { setLoadingLeaderboard(false); }
  }, []);

  const handleOpenLeaderboard = () => {
    setShowLeaderboard(true);
    loadLeaderboard();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const text = t('friends_share_text') + referralLink;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    refreshReferrals();
    await loadMilestones();
    setTimeout(() => setRefreshing(false), 1500);
  };

  const steps = [
    t('friends_step1'),
    t('friends_step2'),
    t('friends_step3'),
    t('friends_step4'),
  ];

  const displayCount = milestoneData?.count ?? referralCount;
  const displayReward = milestoneData?.reward ?? referralBalance;
  const milestones = milestoneData?.milestones ?? [];

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <LeaderboardModal
          onClose={() => setShowLeaderboard(false)}
          leaderboard={leaderboard}
          loading={loadingLeaderboard}
        />
      )}

      {/* Header */}
      <div className="relative z-10 mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-lg">{t('friends_title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/10 hover:bg-white/20 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <Users className="text-primary w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="relative z-10 flex gap-3 mb-4">
        <div className="flex-1 rounded-2xl p-4 text-center border border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="text-2xl font-black text-white">{displayCount}</div>
          <div className="text-xs text-white/70 mt-1 font-semibold">{t('friends_total_referrals')}</div>
        </div>
        <div className="flex-1 rounded-2xl p-4 text-center border border-primary/30" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="text-2xl font-black text-primary">{Number(displayReward).toFixed(4)}</div>
          <div className="text-xs text-white/70 mt-1 font-semibold">{t('friends_gmr_rewards')}</div>
        </div>
      </div>

      {/* Milestone Cards */}
      {milestones.length > 0 && (
        <div className="relative z-10 mb-4">
          <h3 className="text-sm font-black text-white/80 mb-3 flex items-center gap-2">
            <Star className="w-4 h-4 text-primary" />
            مراحل المكافآت
          </h3>
          <div className="space-y-2">
            {milestones.filter(m => m.isEnabled).map(m => {
              const progressPct = Math.min(100, (displayCount / m.inviteCount) * 100);
              return (
                <div
                  key={m.id}
                  className={`rounded-2xl p-3 border flex items-center gap-3 ${
                    m.credited
                      ? 'bg-success/10 border-success/30'
                      : m.reached
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-white/5 border-white/10'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    m.credited ? 'bg-success/20' : m.reached ? 'bg-primary/20' : 'bg-white/10'
                  }`}>
                    <Gift className={`w-5 h-5 ${m.credited ? 'text-success' : m.reached ? 'text-primary' : 'text-white/40'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">{m.inviteCount} دعوة</span>
                      <span className={`text-xs font-black ${m.credited ? 'text-success' : m.reached ? 'text-primary' : 'text-white/60'}`}>
                        +{m.rewardCoins} coin
                      </span>
                    </div>
                    <div className="w-full bg-black/40 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${m.credited ? 'bg-success' : 'bg-primary'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-white/50 mt-0.5">
                      {m.credited
                        ? '✅ تم استلام المكافأة'
                        : m.reached
                        ? '🎉 وصلت! جارٍ الإضافة...'
                        : `${displayCount}/${m.inviteCount} مدعو`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Card */}
      <div className="relative z-10 backdrop-blur-sm border border-white/10 rounded-3xl p-5 mb-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(245,166,35,0.2)]">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">{t('friends_invite_title')}</h2>
            <p className="text-sm text-white/80">
              {t('friends_invite_desc', { reward: '1' })}
            </p>
          </div>
        </div>

        {/* Referral Link + Leaderboard Button */}
        <div className="flex gap-2 mb-4">
          {/* Referral Link Box */}
          <div className="flex-1 rounded-xl p-3 border border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.50)' }}>
            <div className="text-[10px] text-white/60 mb-1 font-semibold">{t('friends_referral_link')}</div>
            <div className="text-xs text-primary font-mono break-all">{referralLink}</div>
          </div>

          {/* Leaderboard Button */}
          <button
            onClick={handleOpenLeaderboard}
            className="w-[60px] flex-shrink-0 rounded-xl border border-white/20 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform overflow-hidden"
            style={{ backgroundColor: '#ffffff' }}
          >
            <img
              src={LEADERBOARD_ICON}
              alt="leaderboard"
              className="w-8 h-8 object-contain"
            />
            <span className="text-[9px] text-black/70 font-bold leading-tight text-center px-1">
              المتصدرون
            </span>
          </button>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleShare}
            className="flex-1 py-3 rounded-xl bg-primary text-black font-black flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,166,35,0.3)]"
          >
            <Share2 className="w-4 h-4" /> {t('friends_share')}
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-3 rounded-xl bg-white/15 hover:bg-white/25 text-white flex items-center justify-center gap-2 transition-colors font-bold text-sm border border-white/10"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copied ? t('friends_copied') : t('friends_copy')}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="relative z-10 border border-white/10 rounded-2xl p-4 mb-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <h3 className="text-sm font-black text-white mb-3">{t('friends_how_it_works')}</h3>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs flex-shrink-0">
                {i + 1}
              </div>
              <span className="text-sm text-white/85 font-medium">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Friends List */}
      <div className="relative z-10 flex-1 pb-8">
        <h3 className="text-xs font-black text-white/60 mb-3 tracking-widest">
          {t('friends_your_friends', { count: String(displayCount) })}
        </h3>
        {displayCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-2xl border border-white/10 border-dashed" style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}>
            <Users className="w-8 h-8 text-white/30 mb-2" />
            <p className="text-sm font-medium text-white/60">{t('friends_no_friends')}</p>
            <p className="text-xs text-white/40 mt-1">{t('friends_share_to_earn')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: displayCount }, (_, i) => (
              <div key={i} className="border border-white/10 rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: 'rgba(0,0,0,0.50)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {String.fromCharCode(65 + (i % 26))}
                  </div>
                  <span className="text-sm text-white font-medium">{t('friends_friend_label')} {i + 1}</span>
                </div>
                <span className="text-xs text-success font-bold">+1 coin</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

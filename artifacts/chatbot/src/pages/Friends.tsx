import { Users, Copy, Share2, CheckCircle2, RefreshCw } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage } from '@/context/LanguageContext';
import { useState } from 'react';

const BOT_USERNAME = 'GramCoin11_bot';

export default function Friends() {
  const { referralCode, referralCount, referralBalance, refreshReferrals } = useWallet();
  const { user: tgUser } = useTelegramUser();
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const referralLink = `https://t.me/${BOT_USERNAME}?start=${tgUser?.id ?? referralCode}`;

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
    setTimeout(() => setRefreshing(false), 1500);
  };

  const steps = [
    t('friends_step1'),
    t('friends_step2'),
    t('friends_step3'),
    t('friends_step4'),
  ];

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

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
          <div className="text-2xl font-black text-white">{referralCount}</div>
          <div className="text-xs text-white/70 mt-1 font-semibold">{t('friends_total_referrals')}</div>
        </div>
        <div className="flex-1 rounded-2xl p-4 text-center border border-primary/30" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
          <div className="text-2xl font-black text-primary">{referralBalance.toFixed(4)}</div>
          <div className="text-xs text-white/70 mt-1 font-semibold">{t('friends_gmr_rewards')}</div>
        </div>
      </div>

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

        {/* Referral Link Box */}
        <div className="rounded-xl p-3 mb-4 border border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.50)' }}>
          <div className="text-[10px] text-white/60 mb-1 font-semibold">{t('friends_referral_link')}</div>
          <div className="text-xs text-primary font-mono break-all">{referralLink}</div>
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
          {t('friends_your_friends', { count: String(referralCount) })}
        </h3>
        {referralCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 rounded-2xl border border-white/10 border-dashed" style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}>
            <Users className="w-8 h-8 text-white/30 mb-2" />
            <p className="text-sm font-medium text-white/60">{t('friends_no_friends')}</p>
            <p className="text-xs text-white/40 mt-1">{t('friends_share_to_earn')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: referralCount }, (_, i) => (
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

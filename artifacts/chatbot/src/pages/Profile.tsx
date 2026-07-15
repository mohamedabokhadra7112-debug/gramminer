import { useState } from 'react';
import WalletModal from '@/components/WalletModal';
import { Settings, Wallet, Activity, Shield, ChevronRight, Check } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage, SUPPORTED_LANGUAGES, type Lang } from '@/context/LanguageContext';

export default function Profile() {
  const { minerLevel, walletAddress } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const { lang, setLang, t } = useLanguage();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /** Pick a language then auto-close the panel after a short delay so the
   *  user can see the ✓ mark before the screen changes. */
  function handleLangSelect(value: Lang) {
    setLang(value);
    setTimeout(() => setShowSettings(false), 400);
  }

  const userName = tgUser?.first_name
    ? `${tgUser.first_name}${tgUser.last_name ? ` ${tgUser.last_name}` : ''}`
    : 'Miner';
  const userInitial = userName[0].toUpperCase();
  const showAvatar = Boolean(avatarUrl) && !avatarFailed;

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* ── User info ── */}
      <div className="relative z-10 flex flex-col items-center mt-2 mb-8">
        <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-2 border-primary/50 relative mb-5 shadow-[0_0_20px_rgba(245,166,35,0.2)] overflow-hidden">
          {showAvatar ? (
            <img src={avatarUrl!} alt={userName} className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
          ) : (
            <span className="font-black text-4xl text-primary">{userInitial}</span>
          )}
          <div className="absolute bottom-0 right-0 w-6 h-6 bg-success rounded-full border-2 border-background shadow-[0_0_10px_rgba(0,255,136,0.5)]" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">{userName}</h1>
        <div className="text-sm text-primary font-black mt-1 uppercase tracking-widest">{t('profile_level')} {minerLevel}</div>

        {/* Wallet status badge */}
        <div className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium mt-4 flex flex-col items-center gap-0.5">
          {walletAddress ? (
            <>
              <span className="text-success font-semibold">{t('profile_connected')}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{shortAddr}</span>
            </>
          ) : (
            <span className="text-destructive/80">{t('profile_not_connected')}</span>
          )}
        </div>
      </div>

      {/* ── Menu cards ── */}
      <div className="relative z-10 flex-1 space-y-3 pb-8">
        <div
          onClick={() => setShowWallet(true)}
          className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Wallet className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_wallet_connection')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_wallet_desc')}</div>
          </div>
        </div>

        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Activity className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_mining_stats')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_mining_stats_desc')}</div>
          </div>
        </div>

        <div className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors">
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Shield className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_security')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_security_desc')}</div>
          </div>
        </div>

        <div
          onClick={() => setShowSettings(true)}
          className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <Settings className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_settings')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_settings_desc')}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* ── Wallet Modal ── */}
      {showWallet && <WalletModal onClose={() => setShowWallet(false)} />}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.90)' }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
            <button
              onClick={() => setShowSettings(false)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold"
            >
              ‹
            </button>
            <h2 className="text-lg font-black text-white">{t('profile_settings')}</h2>
          </div>

          {/* Language section */}
          <div className="flex-1 overflow-y-auto px-4 pt-6">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              {t('profile_language_label')}
            </p>
            <div className="space-y-2">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  key={l.value}
                  onClick={() => handleLangSelect(l.value as Lang)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-colors ${
                    lang === l.value
                      ? 'bg-primary/15 border-primary/50 text-white'
                      : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  <span className="text-2xl">{l.flag}</span>
                  <span className="flex-1 text-left font-semibold">{l.label}</span>
                  {lang === l.value && <Check className="w-5 h-5 text-primary" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

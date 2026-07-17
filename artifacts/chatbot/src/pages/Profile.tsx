import { useState } from 'react';
import { Settings, ArrowLeftRight, ChevronRight, Check, ArrowDown, ArrowUp, Wallet, ExternalLink, Clock } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage, SUPPORTED_LANGUAGES, type Lang } from '@/context/LanguageContext';
import { telegramApiPost, getInitData, API_BASE } from '@/lib/telegramApi';
import WalletModal from '@/components/WalletModal';

// ─── Swap Panel ───────────────────────────────────────────────────────────────
const GMR_PER_GRAM = 700; // 700 GMR = 1 Gram (TON)

function SwapPanel({ onClose }: { onClose: () => void }) {
  const { holdingWallet, sessionEarnings } = useWallet();
  const totalGmr = holdingWallet + sessionEarnings;

  const [direction, setDirection] = useState<'gmr_to_gram' | 'gram_to_gmr'>('gmr_to_gram');
  const [inputVal, setInputVal]   = useState('');

  const fromLabel = direction === 'gmr_to_gram' ? 'GMR' : 'Gram';
  const toLabel   = direction === 'gmr_to_gram' ? 'Gram' : 'GMR';

  const inputNum = parseFloat(inputVal) || 0;
  const outputNum = direction === 'gmr_to_gram'
    ? inputNum / GMR_PER_GRAM
    : inputNum * GMR_PER_GRAM;

  const rate = direction === 'gmr_to_gram'
    ? `1 Gram = ${GMR_PER_GRAM} GMR`
    : `1 GMR = ${(1 / GMR_PER_GRAM).toFixed(4)} Gram`;

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold"
        >‹</button>
        <h2 className="text-lg font-black text-white">Swap</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 space-y-4">
        {/* Rate info */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
          <div className="text-primary font-black text-lg">{rate}</div>
          <div className="text-xs text-white/60 mt-1">سعر التحويل الثابت</div>
        </div>

        {/* From */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-bold uppercase">من</span>
            <span className="text-xs text-muted-foreground">
              {direction === 'gmr_to_gram' ? `الرصيد: ${totalGmr.toFixed(4)} GMR` : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-black text-white outline-none"
              dir="ltr"
            />
            <div className="bg-primary/20 border border-primary/40 rounded-xl px-3 py-1.5">
              <span className="text-primary font-black text-sm">{fromLabel}</span>
            </div>
          </div>
        </div>

        {/* Swap direction button */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              setDirection(d => d === 'gmr_to_gram' ? 'gram_to_gmr' : 'gmr_to_gram');
              setInputVal('');
            }}
            className="w-11 h-11 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors"
          >
            <ArrowLeftRight className="w-5 h-5" />
          </button>
        </div>

        {/* To */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="text-xs text-muted-foreground font-bold uppercase">إلى</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-2xl font-black text-white/70">
              {outputNum > 0 ? outputNum.toFixed(6) : '0.00'}
            </div>
            <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
              <span className="text-white font-black text-sm">{toLabel}</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="text-center text-xs text-white/40 px-2">
          الـ Swap قيد التطوير. سيتم تفعيل التحويل الفعلي قريباً بعد إعداد المحفظة.
        </div>

        {/* Confirm button (disabled until active) */}
        <button
          disabled
          className="w-full py-4 rounded-2xl bg-primary/30 text-primary/50 font-black text-base cursor-not-allowed"
        >
          قريباً — Swap
        </button>
      </div>
    </div>
  );
}

// ─── Withdraw Panel ───────────────────────────────────────────────────────────
function WithdrawPanel({ onClose }: { onClose: () => void }) {
  const { holdingWallet, walletAddress } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({ type: 'idle', msg: '' });
  const [history, setHistory] = useState<{ id: number; amount: number; status: string; created_at: string }[]>([]);

  // Load withdrawal history
  useState(() => {
    const initData = getInitData();
    if (!initData) return;
    fetch(`${API_BASE}/api/telegram/withdraw/status`, { headers: { 'x-init-data': initData } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setHistory(data); })
      .catch(() => {});
  });

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setStatus({ type: 'loading', msg: '' });
    try {
      const data = await telegramApiPost<{ ok: boolean; message: string }>('/telegram/withdraw', { amount: amt });
      setStatus({ type: 'ok', msg: data.message || '✅ تم إرسال طلب السحب' });
      setAmount('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: 'err', msg: `❌ ${msg}` });
    }
  };

  const statusColor = (s: string) =>
    s === 'approved' ? 'text-green-400' : s === 'rejected' ? 'text-red-400' : 'text-yellow-400';
  const statusLabel = (s: string) =>
    s === 'approved' ? '✅ تمت الموافقة' : s === 'rejected' ? '❌ مرفوض' : '⏳ قيد المراجعة';

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
      <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold">‹</button>
        <h2 className="text-lg font-black text-white">سحب GMR</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 space-y-4">
        {/* Wallet address */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1 font-bold">المحفظة المرتبطة</div>
          {walletAddress ? (
            <div className="font-mono text-sm text-white/80 break-all">{walletAddress}</div>
          ) : (
            <div className="text-red-400 text-sm font-medium">❌ لا يوجد محفظة — اربط محفظتك أولاً</div>
          )}
        </div>

        {/* Balance */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
          <div className="text-xs text-white/60 mb-1">الرصيد المتاح للسحب</div>
          <div className="text-3xl font-black text-primary">{holdingWallet.toFixed(4)} GMR</div>
        </div>

        {/* Amount input */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="text-xs text-muted-foreground font-bold uppercase">مبلغ السحب (GMR)</div>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent text-2xl font-black text-white outline-none"
            dir="ltr"
          />
          <button
            onClick={() => setAmount(holdingWallet.toFixed(4))}
            className="text-xs text-primary font-bold hover:underline"
          >
            الكل ({holdingWallet.toFixed(4)} GMR)
          </button>
        </div>

        {/* Status message */}
        {status.msg && (
          <div className={`text-sm font-medium text-center p-3 rounded-xl ${
            status.type === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            status.type === 'err' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''
          }`}>
            {status.msg}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={submit}
          disabled={status.type === 'loading' || !walletAddress || !amount}
          className="w-full py-4 rounded-2xl bg-primary text-black font-black text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {status.type === 'loading' ? '⏳ جار الإرسال...' : '📤 طلب سحب'}
        </button>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">سجل الطلبات</div>
            {history.map(h => (
              <div key={h.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{h.amount.toFixed(4)} GMR</div>
                  <div className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleDateString('ar')}</div>
                </div>
                <div className={`text-xs font-bold ${statusColor(h.status)}`}>{statusLabel(h.status)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────
export default function Profile() {
  const { minerLevel, walletAddress } = useWallet();
  const { user: tgUser, avatarUrl } = useTelegramUser();
  const { lang, setLang, t } = useLanguage();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showWallet, setShowWallet] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

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
        {/* Wallet Connection */}
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
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Withdraw */}
        <div
          onClick={() => setShowWithdraw(true)}
          className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <ArrowUp className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_withdraw')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_withdraw_desc')}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Swap */}
        <div
          onClick={() => setShowSwap(true)}
          className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">{t('profile_swap')}</div>
            <div className="text-xs text-muted-foreground">{t('profile_swap_desc')}</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* Settings */}
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

      {/* ── Modals / Panels ── */}
      {showWallet    && <WalletModal onClose={() => setShowWallet(false)} />}
      {showSwap      && <SwapPanel onClose={() => setShowSwap(false)} />}
      {showWithdraw  && <WithdrawPanel onClose={() => setShowWithdraw(false)} />}

      {/* ── Settings Panel ── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.90)' }}>
          <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
            <button
              onClick={() => setShowSettings(false)}
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold"
            >‹</button>
            <h2 className="text-lg font-black text-white">{t('profile_settings')}</h2>
          </div>
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

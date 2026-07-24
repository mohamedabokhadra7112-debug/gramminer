import { useState, useEffect } from 'react';
import { Settings, ArrowLeftRight, ChevronRight, Check, ArrowUp, ArrowDown, Wallet } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useTelegramUser } from '@/context/TelegramUserContext';
import { useLanguage, SUPPORTED_LANGUAGES, type Lang } from '@/context/LanguageContext';
import { telegramApiPost, getInitData, API_BASE } from '@/lib/telegramApi';
import WalletModal from '@/components/WalletModal';
import { useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';

// ─── Swap Panel ───────────────────────────────────────────────────────────────
function SwapPanel({ onClose }: { onClose: () => void }) {
  const { holdingWallet, sessionEarnings } = useWallet();
  const totalGram = holdingWallet + sessionEarnings;

  const [direction, setDirection] = useState<'gram_to_coins' | 'coins_to_gram'>('gram_to_coins');
  const [inputVal, setInputVal] = useState('');
  const [rate, setRate] = useState<{ gramToCoins: number; coinsToGram: number } | null>(null);
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({ type: 'idle', msg: '' });
  const [history, setHistory] = useState<{ id: number; direction: string; fromAmount: number; toAmount: number; createdAt: string }[]>([]);

  useEffect(() => {
    // Load swap rate from admin settings
    const initData = getInitData();
    if (!initData) { setRate({ gramToCoins: 700, coinsToGram: 700 }); return; }
    fetch(`${API_BASE}/api/telegram/swap/rate`, { headers: { 'x-init-data': initData } })
      .then(r => r.ok ? r.json() : null)
      .then((d: { gramToCoins?: number; coinsToGram?: number } | null) => {
        if (d) setRate({ gramToCoins: d.gramToCoins ?? 700, coinsToGram: d.coinsToGram ?? 700 });
        else setRate({ gramToCoins: 700, coinsToGram: 700 });
      })
      .catch(() => setRate({ gramToCoins: 700, coinsToGram: 700 }));

    // Load swap history
    fetch(`${API_BASE}/api/telegram/swap/history`, { headers: { 'x-init-data': initData } })
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; direction: string; fromAmount: number; toAmount: number; createdAt: string }[]) => {
        if (Array.isArray(d)) setHistory(d);
      })
      .catch(() => {});
  }, []);

  const gramToCoinsRate = rate?.gramToCoins ?? 700;
  const coinsToGramRate = rate?.coinsToGram ?? 700;

  const fromLabel = direction === 'gram_to_coins' ? 'gram' : 'coin';
  const toLabel = direction === 'gram_to_coins' ? 'coin' : 'gram';

  const inputNum = parseFloat(inputVal) || 0;
  const outputNum = direction === 'gram_to_coins'
    ? inputNum * gramToCoinsRate
    : inputNum / coinsToGramRate;

  const rateDisplay = direction === 'gram_to_coins'
    ? `1 gram = ${gramToCoinsRate} coin`
    : `${coinsToGramRate} coin = 1 gram`;

  const handleSwap = async () => {
    if (!inputNum || inputNum <= 0) return;
    setStatus({ type: 'loading', msg: '' });
    try {
      const data = await telegramApiPost<{ ok: boolean; message?: string }>('/telegram/swap', {
        direction,
        amount: inputNum,
      });
      setStatus({ type: 'ok', msg: data.message || '✅ تم التحويل بنجاح' });
      setInputVal('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus({ type: 'err', msg: `❌ ${msg}` });
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold"
        >‹</button>
        <h2 className="text-lg font-black text-white">Swap gram ⇄ coin</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 space-y-4">
        {/* Rate info */}
        <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
          <div className="text-primary font-black text-lg">{rateDisplay}</div>
          <div className="text-xs text-white/60 mt-1">سعر التحويل</div>
        </div>

        {/* From */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground font-bold uppercase">من</span>
            {direction === 'gram_to_coins' && (
              <span className="text-xs text-muted-foreground">الرصيد: {totalGram.toFixed(4)} gram</span>
            )}
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
              setDirection(d => d === 'gram_to_coins' ? 'coins_to_gram' : 'gram_to_coins');
              setInputVal('');
              setStatus({ type: 'idle', msg: '' });
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
              {outputNum > 0 ? (direction === 'gram_to_coins' ? Math.floor(outputNum) : outputNum.toFixed(6)) : '0.00'}
            </div>
            <div className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5">
              <span className="text-white font-black text-sm">{toLabel}</span>
            </div>
          </div>
        </div>

        {/* Status */}
        {status.msg && (
          <div className={`text-sm font-medium text-center p-3 rounded-xl ${
            status.type === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
            status.type === 'err' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''
          }`}>
            {status.msg}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleSwap}
          disabled={status.type === 'loading' || !inputNum || inputNum <= 0}
          className="w-full py-4 rounded-2xl bg-primary text-black font-black text-base disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {status.type === 'loading' ? '⏳ جار التحويل...' : `🔄 تحويل ${fromLabel} إلى ${toLabel}`}
        </button>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2 pb-4">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">سجل التحويلات</div>
            {history.map(h => (
              <div key={h.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">
                    {h.direction === 'gram_to_coins' ? `${h.fromAmount} gram → ${Math.floor(h.toAmount)} coin` : `${h.fromAmount} coin → ${h.toAmount.toFixed(6)} gram`}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleDateString('ar')}</div>
                </div>
                <ArrowLeftRight className="w-4 h-4 text-primary" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Deposit Panel ────────────────────────────────────────────────────────────
// TON Connect direct payment — user pays gram to the bot's wallet and it's
// credited automatically (no TX Hash / admin approval needed).
const OWNER_WALLET = import.meta.env.VITE_OWNER_WALLET as string | undefined;
function DepositPanel({ onClose }: { onClose: () => void }) {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();

  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({ type: 'idle', msg: '' });
  const [history, setHistory] = useState<{ id: number; amount: number; status: string; created_at: string }[]>([]);
  const [showConnectNote, setShowConnectNote] = useState(false);

  const connected = Boolean(tonWallet?.account?.address);
  const amtNum = parseFloat(amount) || 0;

  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;
    fetch(`${API_BASE}/api/telegram/deposit/status`, { headers: { 'x-init-data': initData } })
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; amount: number; status: string; created_at: string }[]) => {
        if (Array.isArray(d)) setHistory(d.slice(0, 10));
      })
      .catch(() => {});
  }, []);

  // If user just connected wallet after tapping "Connect", auto-proceed is handled by
  // watching connected state — UX: just show the Pay button, user taps again.
  useEffect(() => {
    if (connected) setShowConnectNote(false);
  }, [connected]);

  const handlePay = async () => {
    if (!amtNum || amtNum <= 0) return;

    if (!connected) {
      setShowConnectNote(true);
      tonConnectUI.openModal();
      return;
    }

    const toAddress = OWNER_WALLET;
    if (!toAddress || toAddress.startsWith('0:0000')) {
      setStatus({ type: 'err', msg: '❌ محفظة البوت غير مُعدَّة. تواصل مع الدعم.' });
      return;
    }

    setStatus({ type: 'loading', msg: '' });
    try {
      // amtNum gram → nanotons (1 gram = 1 TON = 1e9 nanoton on TON chain)
      const nanotons = BigInt(Math.round(amtNum * 1e9));

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: toAddress,
          amount: nanotons.toString(),
          payload: btoa(`deposit:gram:${amtNum}`),
        }],
      });

      // Submit BOC to backend — backend credits gram balance automatically
      const data = await telegramApiPost<{ ok: boolean; balance?: number; message?: string }>(
        '/telegram/deposit/tonconnect',
        { boc: result.boc, amountGram: amtNum },
      );

      if (data.ok) {
        setStatus({ type: 'ok', msg: data.message ?? `✅ تم إيداع ${amtNum.toFixed(4)} gram بنجاح!` });
        setAmount('');
        // Reload history
        const initData = getInitData();
        if (initData) {
          fetch(`${API_BASE}/api/telegram/deposit/status`, { headers: { 'x-init-data': initData } })
            .then(r => r.ok ? r.json() : [])
            .then((d: { id: number; amount: number; status: string; created_at: string }[]) => {
              if (Array.isArray(d)) setHistory(d.slice(0, 10));
            }).catch(() => {});
        }
      } else {
        setStatus({ type: 'err', msg: `❌ ${data.message ?? 'فشل الإيداع'}` });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('User rejected') || msg.includes('reject') || msg.includes('cancel')) {
        setStatus({ type: 'err', msg: '❌ تم الإلغاء' });
      } else {
        setStatus({ type: 'err', msg: `❌ ${msg}` });
      }
    }
  };

  const statusColor = (s: string) =>
    s === 'confirmed' ? 'text-green-400' : s === 'rejected' ? 'text-red-400' : 'text-yellow-400';
  const statusLabel = (s: string) =>
    s === 'confirmed' ? '✅ مؤكد' : s === 'rejected' ? '❌ مرفوض' : '⏳ قيد المراجعة';

  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}>
      <div className="flex items-center gap-3 px-4 pt-8 pb-4 border-b border-white/10">
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors text-lg font-bold">‹</button>
        <h2 className="text-lg font-black text-white">إيداع gram</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-6 space-y-4">
        {/* Wallet status */}
        <div className={`rounded-2xl p-4 border ${connected ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
          <div className="text-xs text-muted-foreground mb-1 font-bold">المحفظة</div>
          {connected ? (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-green-400 font-mono text-sm">
                {tonWallet?.account?.address?.slice(0, 6)}...{tonWallet?.account?.address?.slice(-4)}
              </span>
            </div>
          ) : (
            <button
              onClick={() => { setShowConnectNote(true); tonConnectUI.openModal(); }}
              className="text-primary font-bold text-sm underline underline-offset-2"
            >
              💎 ربط محفظة TON
            </button>
          )}
        </div>

        {showConnectNote && !connected && (
          <div className="bg-primary/10 border border-primary/30 rounded-2xl p-3 text-sm text-primary/90 text-center">
            بعد ربط المحفظة، اضغط "إيداع" مرة ثانية.
          </div>
        )}

        {/* Amount input */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
          <div className="text-xs text-muted-foreground font-bold uppercase">مبلغ الإيداع (gram)</div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setStatus({ type: 'idle', msg: '' }); }}
              placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-black text-white outline-none"
              dir="ltr"
              min="0"
              step="0.01"
            />
            <div className="bg-primary/20 border border-primary/40 rounded-xl px-3 py-1.5">
              <span className="text-primary font-black text-sm">gram</span>
            </div>
          </div>
          {amtNum > 0 && (
            <div className="text-xs text-white/40">≈ {amtNum.toFixed(4)} TON</div>
          )}
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

        {/* Pay button */}
        <button
          onClick={handlePay}
          disabled={status.type === 'loading' || amtNum <= 0}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#f5a623] to-[#ffd700] text-black font-black text-base shadow-[0_0_20px_rgba(245,166,35,0.3)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
        >
          {status.type === 'loading'
            ? '⏳ جار الإيداع...'
            : !connected
              ? '💎 ربط المحفظة والإيداع'
              : amtNum > 0
                ? `📥 إيداع ${amtNum.toFixed(4)} gram`
                : '📥 إيداع'}
        </button>

        {/* Info footer */}
        <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-400">
            <span>طريقة الدفع</span>
            <span className="text-right text-blue-400 font-bold">TON Connect</span>
            <span>الإضافة للرصيد</span>
            <span className="text-right text-green-400">تلقائية فور الدفع</span>
            <span>1 gram</span>
            <span className="text-right text-primary font-bold">= 1 TON</span>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2 pb-4">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">سجل الإيداعات</div>
            {history.map(h => (
              <div key={h.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{Number(h.amount).toFixed(4)} gram</div>
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

// ─── Withdraw Panel ───────────────────────────────────────────────────────────
function WithdrawPanel({ onClose }: { onClose: () => void }) {
  const { holdingWallet, walletAddress } = useWallet();
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; msg: string }>({ type: 'idle', msg: '' });
  const [history, setHistory] = useState<{ id: number; amount: number; status: string; created_at: string }[]>([]);

  useEffect(() => {
    const initData = getInitData();
    if (!initData) return;
    fetch(`${API_BASE}/api/telegram/withdraw/status`, { headers: { 'x-init-data': initData } })
      .then(r => r.ok ? r.json() : [])
      .then((d: { id: number; amount: number; status: string; created_at: string }[]) => {
        if (Array.isArray(d)) setHistory(d);
      })
      .catch(() => {});
  }, []);

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
        <h2 className="text-lg font-black text-white">سحب gram</h2>
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
          <div className="text-3xl font-black text-primary">{holdingWallet.toFixed(4)} gram</div>
        </div>

        {/* Amount input */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <div className="text-xs text-muted-foreground font-bold uppercase">مبلغ السحب (gram)</div>
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
            الكل ({holdingWallet.toFixed(4)} gram)
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
          <div className="space-y-2 pb-4">
            <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">سجل الطلبات</div>
            {history.map(h => (
              <div key={h.id} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white text-sm">{Number(h.amount).toFixed(4)} gram</div>
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
  const [showDeposit, setShowDeposit] = useState(false);

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
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
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

        {/* Deposit */}
        <div
          onClick={() => setShowDeposit(true)}
          className="bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-2xl p-4 flex items-center gap-4 cursor-pointer hover:bg-secondary/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-white">
            <ArrowDown className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-white mb-0.5">إيداع gram</div>
            <div className="text-xs text-muted-foreground">إيداع gram إلى رصيدك</div>
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
            <div className="text-xs text-muted-foreground">سحب رصيدك إلى محفظة gram</div>
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
            <div className="text-xs text-muted-foreground">تحويل gram ⇄ coin</div>
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
      {showWallet   && <WalletModal onClose={() => setShowWallet(false)} />}
      {showSwap     && <SwapPanel onClose={() => setShowSwap(false)} />}
      {showWithdraw && <WithdrawPanel onClose={() => setShowWithdraw(false)} />}
      {showDeposit  && <DepositPanel onClose={() => setShowDeposit(false)} />}

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

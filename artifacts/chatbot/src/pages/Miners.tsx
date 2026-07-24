import { useState, useEffect, useCallback } from 'react';
import { Clock, Zap, ShoppingBag, Package, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { formatGram } from '@/lib/utils';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';
import { useTonConnectUI } from '@tonconnect/ui-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StoreProduct {
  id: number;
  name: string;
  description: string | null;
  coinPrice: number;
  gramValue: number;
  dailyMiningPct: number;
  isEnabled: boolean;
}

interface UserPurchase {
  id: number;
  productId: number;
  productName: string;
  coinsPaid: number;
  gramValue: number;
  dailyMiningPct: number;
  purchasedAt: string;
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// 700 coin = 1 gram (matches the mining formula)
const COINS_PER_GRAM = 700;

// ─── Main Miners/Store Page ───────────────────────────────────────────────────
export default function Miners() {
  const { coins, refreshBalance } = useCoins();
  const { walletAddress } = useWallet();
  const [tonConnectUI] = useTonConnectUI();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [purchases, setPurchases] = useState<UserPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null);
  const [paying, setPaying] = useState<number | null>(null);   // gram payment in progress
  const [feedback, setFeedback] = useState<{ id: number; msg: string; ok: boolean } | null>(null);

  const loadData = useCallback(async () => {
    const initData = getInitData();
    const headers: Record<string, string> = {};
    if (initData) headers['x-init-data'] = initData;

    try {
      const [prodRes, purchRes] = await Promise.all([
        fetch(`${API_BASE}/api/store/products`, { headers }),
        initData ? fetch(`${API_BASE}/api/store/purchases`, { headers }) : Promise.resolve(null),
      ]);

      if (prodRes.ok) {
        const data = await prodRes.json() as StoreProduct[];
        setProducts(Array.isArray(data) ? data.filter(p => p.isEnabled) : []);
      }
      if (purchRes && purchRes.ok) {
        const data = await purchRes.json() as UserPurchase[];
        setPurchases(Array.isArray(data) ? data : []);
      }
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Buy with coins ────────────────────────────────────────────────────────
  const handleBuy = async (product: StoreProduct) => {
    if (coins < product.coinPrice) return;
    setBuying(product.id);
    try {
      const data = await telegramApiPost<{ ok: boolean; message?: string }>('/store/purchase', { productId: product.id });
      if (data.ok) {
        setFeedback({ id: product.id, msg: `✅ تم الشراء بنجاح!`, ok: true });
        await loadData();
        await refreshBalance();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({ id: product.id, msg: `❌ ${msg}`, ok: false });
    } finally {
      setBuying(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  // ── Pay with gram wallet (TON Connect) ───────────────────────────────────
  const handleGramPay = async (product: StoreProduct) => {
    setPaying(product.id);
    setFeedback(null);
    try {
      // If no wallet connected, open TonConnect modal first
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        setPaying(null);
        setFeedback({ id: product.id, msg: 'وصّل محفظتك أولاً ثم اضغط مرة ثانية', ok: false });
        return;
      }

      // gramPrice = coinPrice / 700, in nanotons (1 gram = 1e9 nanotons on TON)
      const gramPrice = product.coinPrice / COINS_PER_GRAM;
      const nanotons  = BigInt(Math.round(gramPrice * 1e9));

      // Owner/recipient address from env — falls back to zero address for preview
      const toAddress = import.meta.env.VITE_OWNER_WALLET ?? '0:0000000000000000000000000000000000000000000000000000000000000000';

      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{
          address: toAddress,
          amount: nanotons.toString(),
          payload: btoa(`store_purchase:${product.id}`),
        }],
      });

      // Submit boc to backend — it will credit coins and record the purchase
      const boc = result.boc;
      const resp = await telegramApiPost<{ ok: boolean; coins?: number; message?: string }>(
        '/store/gram-purchase',
        { productId: product.id, boc },
      );

      if (resp.ok) {
        setFeedback({ id: product.id, msg: `✅ تم الدفع! حصلت على ${product.coinPrice.toLocaleString()} coin`, ok: true });
        await loadData();
        await refreshBalance();
      } else {
        setFeedback({ id: product.id, msg: `⚠️ المعاملة أُرسلت — جارٍ التحقق يدوياً`, ok: false });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('User rejected') || msg.includes('reject')) {
        setFeedback({ id: product.id, msg: `❌ تم الإلغاء`, ok: false });
      } else {
        setFeedback({ id: product.id, msg: `❌ ${msg}`, ok: false });
      }
    } finally {
      setPaying(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Coin-based daily income displayed at top (matches WalletContext formula)
  const dailyIncome = coins > 0 ? Math.round((coins / 14_000) * 1_000_000) / 1_000_000 : 0;

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-5">
      <div className="absolute inset-0 z-0" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }} />

      {/* ── Header ── */}
      <div className="relative z-10 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black text-white tracking-tight">⛏️ Gram Store</h1>
          <div className="flex items-center gap-1.5 bg-black/50 border border-yellow-500/30 rounded-xl px-3 py-1.5">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-yellow-400 font-bold text-sm">{coins.toLocaleString()} coin</span>
          </div>
        </div>

        {/* Mining summary panel */}
        <div className="bg-secondary/50 border border-white/10 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className={`font-bold text-sm ${coins > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                {coins > 0 ? '🟢 التعدين نشط' : '🔴 لا يوجد تعدين'}
              </div>
              <div className="text-gray-400 text-xs mt-0.5">
                {coins > 0
                  ? `+${formatGram(dailyIncome, 6)} gram / 24h`
                  : 'اشترِ coin لبدء التعدين'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-white text-xs font-semibold">{coins.toLocaleString()} coin</div>
              <div className="text-gray-500 text-[10px]">5% يومياً ÷ 700</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── My Purchases ── */}
      {purchases.length > 0 && (
        <div className="relative z-10 mb-4">
          <h2 className="text-sm font-black text-white/70 mb-2 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-primary" /> مشترياتي
          </h2>
          <div className="space-y-2">
            {purchases.map(p => (
              <div key={p.id} className="bg-secondary/60 backdrop-blur-sm border border-primary/20 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm truncate">{p.productName ?? `باقة #${p.productId}`}</div>
                  <div className="text-green-400 text-xs">{p.coinsPaid.toLocaleString()} coin · {formatGram(p.gramValue, 1)} gram</div>
                  <div className="text-white/40 text-[10px]">{new Date(p.purchasedAt).toLocaleDateString('ar')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Store Products ── */}
      <div className="relative z-10 flex-1 pb-6">
        <h2 className="text-sm font-black text-white/70 mb-2 flex items-center gap-1.5">
          <ShoppingBag className="w-4 h-4 text-primary" /> المتجر
        </h2>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!loading && products.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            لا توجد منتجات متاحة حالياً
          </div>
        )}

        <div className="space-y-3">
          {products.map(product => {
            const canAfford  = coins >= product.coinPrice;
            const gramPrice  = product.coinPrice / COINS_PER_GRAM;
            const fb         = feedback?.id === product.id ? feedback : null;
            const isBuying   = buying === product.id;
            const isPaying   = paying === product.id;
            const hasWallet  = !!walletAddress || tonConnectUI.connected;

            return (
              <div
                key={product.id}
                className={`bg-secondary/60 backdrop-blur-sm border rounded-2xl p-4 transition-all ${
                  canAfford ? 'border-primary/30' : 'border-white/10'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 text-3xl">
                    {product.name.split(' ')[0]}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm leading-tight">{product.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-yellow-400 text-xs font-bold">
                        🪙 {product.coinPrice.toLocaleString()} coin
                      </span>
                      <span className="text-white/30 text-xs">أو</span>
                      <span className="text-blue-400 text-xs font-bold">
                        💎 {gramPrice % 1 === 0 ? gramPrice : gramPrice.toFixed(2)} gram
                      </span>
                    </div>
                    <div className="text-green-400 text-[11px] mt-0.5">
                      +{formatGram(product.gramValue * (product.dailyMiningPct ?? 0.05), 4)} gram / يوم
                    </div>
                  </div>
                </div>

                {/* Buy buttons */}
                <div className="mt-3 flex gap-2">
                  {/* Pay with coins */}
                  <button
                    onClick={() => handleBuy(product)}
                    disabled={isBuying || isPaying || !canAfford}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 ${
                      canAfford && !isPaying
                        ? 'bg-primary text-black shadow-[0_0_10px_rgba(245,166,35,0.3)] hover:opacity-90'
                        : 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isBuying
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <><Zap className="w-3 h-3" /> {canAfford ? 'شراء بـ Coin' : `ناقص ${(product.coinPrice - coins).toLocaleString()}`}</>
                    }
                  </button>

                  {/* Pay with gram wallet */}
                  <button
                    onClick={() => handleGramPay(product)}
                    disabled={isBuying || isPaying}
                    className="flex-1 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1 bg-blue-600/80 text-white hover:bg-blue-500/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPaying
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <><Wallet className="w-3 h-3" /> {hasWallet ? `دفع ${gramPrice % 1 === 0 ? gramPrice : gramPrice.toFixed(2)} gram` : 'وصّل محفظة'}</>
                    }
                  </button>
                </div>

                {/* Feedback */}
                {fb && (
                  <div className={`mt-2 text-xs font-medium px-2 py-1 rounded-lg ${
                    fb.ok ? 'text-success bg-success/10' : 'text-yellow-400 bg-yellow-500/10'
                  }`}>
                    {fb.msg}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Info footer ── */}
      <div className="relative z-10 mb-4 rounded-2xl bg-black/50 border border-white/10 p-4">
        <div className="grid grid-cols-2 gap-y-2 text-xs text-gray-400">
          <span>معادلة التحويل</span>
          <span className="text-right font-bold text-primary">700 coin = 1 gram</span>
          <span>معدل التعدين</span>
          <span className="text-right text-green-400">5% يومياً من الـ coin</span>
          <span>0 coin</span>
          <span className="text-right text-red-400">= 0 تعدين</span>
          <span>طريقة الدفع</span>
          <span className="text-right text-blue-400">Coin أو Gram Wallet</span>
        </div>
      </div>
    </div>
  );
}

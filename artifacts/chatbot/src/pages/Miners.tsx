import { useState, useEffect, useCallback } from 'react';
import { Clock, Zap, ShoppingBag, Package, CheckCircle2, Loader2 } from 'lucide-react';
import { useCoins } from '@/context/CoinsContext';
import { useWallet } from '@/context/WalletContext';
import { useMiners } from '@/context/MinersContext';
import { formatGram } from '@/lib/utils';
import { getInitData, API_BASE, telegramApiPost } from '@/lib/telegramApi';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StoreProduct {
  id: number;
  name: string;
  description: string | null;
  coinPrice: number;
  dailyRewardGram: number;
  isEnabled: boolean;
}

interface UserPurchase {
  id: number;
  productId: number;
  productName: string;
  coinsPaid: number;
  dailyRewardGram: number;
  purchasedAt: string;
}

interface MiningStatus {
  isActive: boolean;
  totalDailyReward: number;
  canClaim: boolean;
  remainingMs: number;
  pendingGram: number;
  lastClaimAt: string | null;
}

function formatCountdown(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1_000);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

// ─── Main Miners/Store Page ───────────────────────────────────────────────────
export default function Miners() {
  const { coins } = useCoins();
  const { addClickEarning } = useWallet();
  const { canClaim: legacyCanClaim, totalPending: legacyPending, remainingMs: legacyRemainingMs, claimAll } = useMiners();

  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [purchases, setPurchases] = useState<UserPurchase[]>([]);
  const [miningStatus, setMiningStatus] = useState<MiningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [feedback, setFeedback] = useState<{ id: number; msg: string; ok: boolean } | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Tick for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadData = useCallback(async () => {
    const initData = getInitData();
    const headers: Record<string, string> = {};
    if (initData) headers['x-init-data'] = initData;

    try {
      const [prodRes, purchRes, mineRes] = await Promise.all([
        fetch(`${API_BASE}/api/store/products`, { headers }),
        initData ? fetch(`${API_BASE}/api/store/purchases`, { headers }) : Promise.resolve(null),
        initData ? fetch(`${API_BASE}/api/telegram/mining/status`, { headers }) : Promise.resolve(null),
      ]);

      if (prodRes.ok) {
        const data = await prodRes.json() as StoreProduct[];
        setProducts(Array.isArray(data) ? data.filter(p => p.isEnabled) : []);
      }
      if (purchRes && purchRes.ok) {
        const data = await purchRes.json() as UserPurchase[];
        setPurchases(Array.isArray(data) ? data : []);
      }
      if (mineRes && mineRes.ok) {
        const data = await mineRes.json() as MiningStatus;
        setMiningStatus(data);
      }
    } catch { /* best-effort */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBuy = async (product: StoreProduct) => {
    if (coins < product.coinPrice) {
      setFeedback({ id: product.id, msg: `❌ رصيد coin غير كافٍ (تحتاج ${product.coinPrice})`, ok: false });
      setTimeout(() => setFeedback(null), 3000);
      return;
    }
    setBuying(product.id);
    try {
      const data = await telegramApiPost<{ ok: boolean; message?: string }>('/store/purchase', { productId: product.id });
      if (data.ok) {
        setFeedback({ id: product.id, msg: `✅ تم الشراء! ${data.message ?? ''}`, ok: true });
        await loadData();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setFeedback({ id: product.id, msg: `❌ ${msg}`, ok: false });
    } finally {
      setBuying(null);
      setTimeout(() => setFeedback(null), 3500);
    }
  };

  const handleStoreClaim = async () => {
    if (!miningStatus?.canClaim) return;
    setClaiming(true);
    try {
      const data = await telegramApiPost<{ ok: boolean; gram?: number; message?: string }>('/telegram/mining/claim', {});
      if (data.ok) {
        setStatusMsg(`✅ استلمت ${(data.gram ?? 0).toFixed(4)} gram`);
        await loadData();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg(`❌ ${msg}`);
    } finally {
      setClaiming(false);
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  // Determine mining display: prefer store mining status if available and user has purchases
  const hasPurchases = purchases.length > 0;
  const storeIsActive = miningStatus?.isActive ?? false;
  const storeCanClaim = miningStatus?.canClaim ?? false;
  const storePending = miningStatus?.pendingGram ?? 0;
  const storeRemaining = miningStatus
    ? Math.max(0, miningStatus.remainingMs ?? 0)
    : 0;

  // Legacy miners (MinersContext) — shown only if user has no store purchases
  const showLegacyClaim = !hasPurchases && legacyCanClaim && legacyPending > 0;

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

        {/* Mining Status Panel */}
        {(hasPurchases || storeIsActive) ? (
          <div className="bg-secondary/50 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              {storeCanClaim ? (
                storePending > 0 ? (
                  <>
                    <div className="text-green-400 font-bold text-sm">
                      +{formatGram(storePending, 4)} gram جاهز للاستلام!
                    </div>
                    <div className="text-gray-400 text-xs mt-0.5">دورة التعدين اكتملت</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-300 font-semibold text-sm">التعدين نشط</div>
                    <div className="text-gray-500 text-xs">+{formatGram(miningStatus?.totalDailyReward ?? 0, 4)} gram/24h</div>
                  </>
                )
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-white font-bold text-sm">
                    <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="font-mono">{formatCountdown(storeRemaining)}</span>
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">حتى الدورة التالية · {formatGram(miningStatus?.totalDailyReward ?? 0, 4)} gram/24h</div>
                </>
              )}
            </div>
            <button
              onClick={handleStoreClaim}
              disabled={!storeCanClaim || storePending <= 0 || claiming}
              className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                storeCanClaim && storePending > 0
                  ? 'bg-green-500 text-black shadow-[0_0_12px_rgba(34,197,94,0.4)] hover:opacity-90 active:scale-95'
                  : 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
              }`}
            >
              {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'استلام'}
            </button>
          </div>
        ) : (
          /* Legacy miners claim panel — only when user has no store purchases */
          <div className="bg-secondary/50 border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              {showLegacyClaim ? (
                <>
                  <div className="text-green-400 font-bold text-sm">
                    +{formatGram(legacyPending, 2)} gram جاهز!
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">من أجهزة التعدين القديمة</div>
                </>
              ) : legacyPending <= 0 ? (
                <>
                  <div className="text-gray-300 font-semibold text-sm">لا يوجد تعدين نشط</div>
                  <div className="text-gray-500 text-xs">اشتر منتجاً من المتجر للبدء</div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 text-white font-bold text-sm">
                    <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <span className="font-mono">{formatCountdown(legacyRemainingMs)}</span>
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">حتى دورة التعدين التالية</div>
                </>
              )}
            </div>
            <button
              onClick={() => { if (showLegacyClaim) claimAll(addClickEarning); }}
              disabled={!showLegacyClaim}
              className={`flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                showLegacyClaim
                  ? 'bg-green-500 text-black shadow-[0_0_12px_rgba(34,197,94,0.4)] hover:opacity-90 active:scale-95'
                  : 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
              }`}
            >
              استلام
            </button>
          </div>
        )}

        {statusMsg && (
          <div className={`mt-2 text-xs text-center font-medium px-2 py-1 rounded-lg ${
            statusMsg.startsWith('✅') ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
          }`}>
            {statusMsg}
          </div>
        )}
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
                  <div className="text-white font-bold text-sm truncate">{p.productName}</div>
                  <div className="text-green-400 text-xs">{formatGram(p.dailyRewardGram, 4)} gram/24h</div>
                  <div className="text-white/40 text-[10px]">{new Date(p.purchasedAt).toLocaleDateString('ar')} · {p.coinsPaid.toLocaleString()} coin</div>
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
            const canAfford = coins >= product.coinPrice;
            const fb = feedback?.id === product.id ? feedback : null;
            const isBuying = buying === product.id;

            return (
              <div
                key={product.id}
                className={`bg-secondary/60 backdrop-blur-sm border rounded-2xl p-4 transition-all ${
                  canAfford ? 'border-primary/30' : 'border-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    <ShoppingBag className="w-7 h-7 text-primary" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm leading-tight">{product.name}</div>
                    {product.description && (
                      <div className="text-white/50 text-xs mt-0.5 truncate">{product.description}</div>
                    )}
                    <div className="text-green-400 text-xs font-semibold mt-0.5">
                      +{formatGram(product.dailyRewardGram, 4)} gram / 24h
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      التعدين: 5% يومياً
                    </div>
                  </div>

                  {/* Buy button */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <div className="text-yellow-400 text-xs font-bold">
                      {product.coinPrice.toLocaleString()} coin
                    </div>
                    <button
                      onClick={() => handleBuy(product)}
                      disabled={isBuying || !canAfford}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                        !canAfford
                          ? 'bg-gray-700/60 text-gray-500 cursor-not-allowed'
                          : 'bg-primary text-black shadow-[0_0_10px_rgba(245,166,35,0.3)] hover:opacity-90'
                      }`}
                    >
                      {isBuying ? <Loader2 className="w-3 h-3 animate-spin" /> : '🛒 شراء'}
                    </button>
                    {!canAfford && (
                      <span className="text-[10px] text-gray-500">
                        تحتاج {(product.coinPrice - coins).toLocaleString()} coin أكثر
                      </span>
                    )}
                  </div>
                </div>

                {/* Feedback */}
                {fb && (
                  <div className={`mt-2 text-xs font-medium px-2 py-1 rounded-lg ${
                    fb.ok ? 'text-success bg-success/10' : 'text-red-400 bg-red-500/10'
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
          <span>سعر التحويل</span>
          <span className="text-right font-bold text-primary">700 coin = 1 gram</span>
          <span>معدل التعدين</span>
          <span className="text-right text-green-400">5% يومياً</span>
          <span>دورة التعدين</span>
          <span className="text-right text-gray-300">كل 24 ساعة</span>
          <span>شرط البدء</span>
          <span className="text-right text-blue-400">يجب امتلاك coin أولاً</span>
        </div>
      </div>
    </div>
  );
}

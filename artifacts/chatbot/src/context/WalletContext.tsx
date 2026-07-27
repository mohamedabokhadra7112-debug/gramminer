import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { telegramApiPost, API_BASE, getInitData } from '@/lib/telegramApi';
import { useTelegramUser } from './TelegramUserContext';

type WalletContextType = {
  holdingWallet: number;
  poolWallet: number;
  sessionEarnings: number;
  referralBalance: number;
  walletAddress: string | null;
  minerLevel: number;
  referralCode: string;
  referralCount: number;
  isClaiming: boolean;
  claimError: string | null;
  claimEarnings: () => void;
  connectWallet: (address: string) => void;
  addReferral: () => void;
  refreshReferrals: () => void;
  addClickEarning: (amount: number) => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

/** Returns a per-user localStorage key so different Telegram accounts
 *  stored on the same device never share the same balance. */
function getLsKey(suffix: string): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? `gmr_${suffix}_${tgId}` : `gmr_${suffix}`;
}

function getStoredBalance(): number {
  try {
    const v = localStorage.getItem(getLsKey('holding_balance'));
    if (v === null) return 0;
    const n = Number(v);
    // Guard: Number("NaN") = NaN, Number("null") = NaN, Number("undefined") = NaN
    // isFinite rejects NaN, +Infinity, -Infinity — all invalid balances.
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

/** Write-through helper. Silently drops writes where val is not a valid finite
 *  number — this is the single choke-point that prevents "NaN" / "null" /
 *  "undefined" strings from ever entering localStorage and becoming permanent. */
function storeBalance(val: number) {
  try {
    if (!Number.isFinite(val)) return; // never write NaN / Infinity
    localStorage.setItem(getLsKey('holding_balance'), String(val));
  } catch {}
}

function getStoredWallet(): string | null {
  try { return localStorage.getItem(getLsKey('wallet_address')); } catch { return null; }
}

function storeWallet(addr: string | null) {
  try {
    if (addr) localStorage.setItem(getLsKey('wallet_address'), addr);
    else localStorage.removeItem(getLsKey('wallet_address'));
  } catch {}
}

/** Referral code is just the Telegram user ID (plain number string).
 *  Format: https://t.me/BotName?start=<userId>
 *  This is the canonical format — gram address, no prefix required. */
function generateCode(): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? String(tgId) : '';
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { user, isVerified } = useTelegramUser();

  const [holdingWallet, setHoldingWalletRaw] = useState<number>(getStoredBalance);
  const [poolWallet]       = useState(0);
  const [sessionEarnings, setSessionEarnings] = useState(0);
  const [referralBalance, setReferralBalance] = useState(0);
  const [walletAddress, setWalletAddressState] = useState<string | null>(getStoredWallet);
  const [minerLevel]     = useState(1);
  const [referralCode]   = useState(() => generateCode());
  const [referralCount, setReferralCount] = useState(0);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Write-through: state + localStorage in sync.
  // Sanitises the value before writing: NaN / Infinity can slip in from a
  // null/undefined API response (typeof null === 'object', typeof NaN === 'number')
  // so we clamp to 0 here as the single choke-point for the entire context.
  const setHoldingWallet = useCallback((val: number) => {
    const safe = Number.isFinite(val) ? val : 0;
    storeBalance(safe);
    setHoldingWalletRaw(safe);
  }, []);

  const connectWallet = useCallback((address: string) => {
    const addr = address || null;
    storeWallet(addr);
    setWalletAddressState(addr);
  }, []);

  // Sync with server balance whenever auth resolves (on mount and on every
  // visibility-change re-auth so the balance stays fresh after the app is
  // re-opened from the background).
  // The server is always the authoritative source of truth.
  // We only trust localStorage over the server if the difference is small
  // (≤ MAX_UNSYNCED_GRAM) — that margin represents earnings saved locally
  // but not yet flushed to the DB due to a failed network save.
  // If localStorage is much higher than the server, it is almost certainly
  // corrupted (e.g. from a previous bug or repeated aborted-request fallbacks)
  // and we discard it by using the server value.
  const seededFromServer = useRef(false);
  const MAX_UNSYNCED_GRAM = 10; // max plausible unsynced offline earnings
  useEffect(() => {
    if (!isVerified) return;
    // typeof NaN === 'number' is TRUE — we must use isFinite, not typeof.
    const serverBalance = Number(user?.balance);
    if (!Number.isFinite(serverBalance)) return;
    seededFromServer.current = true;
    const storedBalance = getStoredBalance(); // already guarded → 0 if NaN
    const diff = storedBalance - serverBalance;
    const safeBalance = diff > 0 && diff <= MAX_UNSYNCED_GRAM
      ? storedBalance   // small legitimate offline gap — preserve it
      : serverBalance;  // server wins (stored value is stale or corrupted)
    setHoldingWallet(safeBalance); // setHoldingWallet itself is NaN-safe
  }, [isVerified, user?.balance, setHoldingWallet]);

  // Load referrals from server
  const fetchReferrals = useCallback(async () => {
    const initData = getInitData();
    if (!initData) return;
    try {
      const res = await fetch(`${API_BASE}/api/telegram/referrals`, {
        headers: { 'x-init-data': initData },
      });
      if (!res.ok) return;
      const data = await res.json() as { count: number; reward: number };
      setReferralCount(data.count ?? 0);
      setReferralBalance(data.reward ?? 0);
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    if (isVerified) fetchReferrals();
  }, [isVerified, fetchReferrals]);

  // Passive earnings — CONTINUOUS coin-based mining:
  //   daily_income (gram) = coins / 14_000   (700 coin = 1 gram, 5 % daily)
  //   per-second          = daily / 86_400
  //   0 coins → 0 mining (no tick increments balance)
  //
  // Accrual is TIME-based and continues even while the app is closed. The
  // server is the source of truth for lastMiningAt: on auth we fetch the
  // server-computed accrued value (elapsed since last claim, capped at 24h),
  // seed sessionEarnings with it, and then the 1s ticker keeps incrementing
  // ONLY until total elapsed reaches 24h — after which mining freezes until the
  // user claims (which resets the cycle on the server).
  //
  // Coins are read from localStorage each tick to avoid a circular
  // context dependency (CoinsContext → WalletContext → CoinsContext).
  // CoinsContext writes per-user keys of the form `gram_coins_balance_<tgId>`.
  const MINING_CAP_SECONDS = 86_400; // 24h cap — mining stops here until claim
  function getCoinsFromStorage(): number {
    try {
      const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      const key = tgId ? `gram_coins_balance_${tgId}` : 'gram_coins_balance';
      const val = localStorage.getItem(key);
      return val !== null ? Math.max(0, Number(val) || 0) : 0;
    } catch { return 0; }
  }

  // Tracks elapsed accrual seconds since the last claim (seeded from server).
  // Used to freeze the ticker once we hit the 24h cap.
  const elapsedSecondsRef = useRef(0);

  // Seed sessionEarnings from the server-authoritative accrued value whenever
  // auth resolves. This captures earnings accrued while the app was closed.
  useEffect(() => {
    if (!isVerified) return;
    const initData = getInitData();
    if (!initData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/telegram/mining/accrued`, {
          headers: { 'x-init-data': initData },
        });
        if (!res.ok) return;
        const data = await res.json() as {
          accrued: number;
          elapsedSeconds: number;
          cappedAt24h: boolean;
        };
        if (cancelled) return;
        const accrued = Number(data?.accrued);
        const elapsed = Number(data?.elapsedSeconds);
        elapsedSecondsRef.current = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
        setSessionEarnings(Number.isFinite(accrued) ? Math.max(0, accrued) : 0);
      } catch { /* best-effort — ticker still runs from 0 */ }
    })();
    return () => { cancelled = true; };
  }, [isVerified]);

  // 1s ticker — increments sessionEarnings while accrual is below the 24h cap.
  // Freezes once elapsed reaches MINING_CAP_SECONDS (until the user claims).
  useEffect(() => {
    const interval = setInterval(() => {
      if (elapsedSecondsRef.current >= MINING_CAP_SECONDS) return; // capped — freeze
      elapsedSecondsRef.current += 1;
      const coins = getCoinsFromStorage();
      if (coins <= 0) return; // 0 coins = no mining
      const perSecond = coins / 14_000 / 86_400;
      setSessionEarnings(prev =>
        Math.round((prev + perSecond) * 1_000_000_000) / 1_000_000_000,
      );
    }, 1_000);
    return () => clearInterval(interval);
  }, []);

  // Keep a stable ref to the latest sessionEarnings so async handlers always
  // read the current value without stale-closure issues.
  const sessionEarningsRef = useRef(sessionEarnings);
  useEffect(() => { sessionEarningsRef.current = sessionEarnings; }, [sessionEarnings]);

  // Prevent concurrent claims racing each other.
  const isSavingRef = useRef(false);

  /**
   * Claim — settles the continuous mining accrual on the server.
   *
   * The server IGNORES any client-sent amount and credits its own
   * server-computed accrued value (elapsed since last claim × per-second rate,
   * capped at 24h), then resets last_mining_at to NOW() — restarting the cycle.
   * On success we set sessionEarnings=0, reset the local elapsed counter, and
   * adopt the server's authoritative balance.
   */
  const claimEarnings = useCallback(() => {
    if (isSavingRef.current) return;
    // Nothing to claim if there are no session earnings and no pool balance.
    const pending = +(poolWallet + sessionEarningsRef.current).toFixed(6);
    if (!Number.isFinite(pending) || pending <= 0) return;

    isSavingRef.current = true;
    setIsClaiming(true);
    setClaimError(null);

    // Sending `amount` is harmless (server ignores it) — kept for backwards compat.
    telegramApiPost<{ balance: number; claimed?: number }>('/telegram/claim', {
      amount: pending,
    })
      .then((data) => {
        const serverBalance = Number(data?.balance);
        if (Number.isFinite(serverBalance)) {
          setHoldingWallet(serverBalance); // setHoldingWallet is NaN-safe
        }
        // Reset the accrual cycle locally to mirror the server reset.
        setSessionEarnings(0);
        elapsedSecondsRef.current = 0;
      })
      .catch(() => {
        setClaimError('Failed to claim. Please try again.');
      })
      .finally(() => {
        isSavingRef.current = false;
        setIsClaiming(false);
      });
  }, [poolWallet, setHoldingWallet]);

  const addReferral = () => {
    setReferralCount(prev => prev + 1);
    setReferralBalance(prev => prev + 1);
  };

  const refreshReferrals = () => { fetchReferrals(); };

  /**
   * Add gram earnings from OTHER sources (e.g. miner clicks in Miners.tsx).
   * Credits the server via the lightweight /telegram/credit route which does
   * NOT touch last_mining_at (so it never interferes with mining accrual).
   * Falls back to local accumulation if the API is unavailable so earnings
   * survive a refresh. Amount must be finite, > 0, and <= 100 (server-enforced).
   */
  const addClickEarning = useCallback(async (amount: number) => {
    const amt = Math.round(Number(amount) * 1_000_000) / 1_000_000;
    if (!Number.isFinite(amt) || amt <= 0 || amt > 100) return;
    try {
      const data = await telegramApiPost<{ balance: number }>('/telegram/credit', { amount: amt });
      const serverBalance = Number(data?.balance);
      if (Number.isFinite(serverBalance)) {
        setHoldingWallet(serverBalance);
      } else {
        setHoldingWallet(getStoredBalance() + amt);
      }
    } catch {
      // API unavailable — accumulate locally so earnings survive a refresh.
      setHoldingWallet(getStoredBalance() + amt); // setHoldingWallet is NaN-safe
    }
  }, [setHoldingWallet]);

  return (
    <WalletContext.Provider value={{
      holdingWallet, poolWallet, sessionEarnings,
      referralBalance, walletAddress, minerLevel,
      referralCode, referralCount, isClaiming, claimError,
      claimEarnings, connectWallet, addReferral, refreshReferrals, addClickEarning,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}

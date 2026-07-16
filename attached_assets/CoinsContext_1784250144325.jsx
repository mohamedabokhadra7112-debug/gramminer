import { createContext, useContext, useEffect, useState } from "react";

const CoinsContext = createContext(null);

// مؤقتًا بنستخدم localStorage عشان الرصيد يفضل موجود حتى بعد الـ refresh.
// لما يبقى عندك API حقيقي لرصيد اليوزر، بدّل الدالتين setBalance/spend تحت
// بحيث يبعتوا request للسيرفر بدل ما يشتغلوا محليًا بس.
const STORAGE_KEY = "gram_coins_balance";

export function CoinsProvider({ children }) {
  const [coins, setCoins] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? Number(saved) : 100000; // رصيد ابتدائي تجريبي
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(coins));
  }, [coins]);

  // TODO: لما يكون عندك API، استبدل الجسم ده بـ:
  // const res = await fetch("/api/user/balance"); const data = await res.json(); setCoins(data.balance);
  const refreshBalance = async () => {
    setLoading(true);
    // fetch من السيرفر هنا
    setLoading(false);
  };

  // بيرجع true لو نجحت عملية الخصم، false لو الرصيد مش كفاية
  const spendCoins = (amount) => {
    let success = false;
    setCoins((prev) => {
      if (prev >= amount) {
        success = true;
        return prev - amount;
      }
      return prev;
    });
    // TODO: نادي هنا على API خصم الرصيد الحقيقي:
    // await fetch("/api/user/spend", { method: "POST", body: JSON.stringify({ amount }) });
    return success;
  };

  const addCoins = (amount) => {
    setCoins((prev) => prev + amount);
    // TODO: API إضافة رصيد (مثلاً بعد جمع أرباح التعدين كل 24 ساعة)
  };

  return (
    <CoinsContext.Provider
      value={{ coins, loading, spendCoins, addCoins, refreshBalance }}
    >
      {children}
    </CoinsContext.Provider>
  );
}

export function useCoins() {
  const ctx = useContext(CoinsContext);
  if (!ctx) {
    throw new Error("useCoins لازم يتستخدم جوه CoinsProvider");
  }
  return ctx;
}

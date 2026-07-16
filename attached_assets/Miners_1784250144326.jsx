import { useState } from "react";
import { Lock } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useCoins } from "@/context/CoinsContext";

const initialMiners = [
  {
    id: 1,
    name: "Stone Collector",
    image: "/miners/miner1.svg",
    baseCost: 10,
    reward: 0.5,
    percent: "5%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 2,
    name: "Copper Miner",
    image: "/miners/miner2.svg",
    baseCost: 50,
    reward: 2.5,
    percent: "5%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 3,
    name: "Ore Cart",
    image: "/miners/miner3.svg",
    baseCost: 250,
    reward: 12.5,
    percent: "5%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 4,
    name: "Crystal Hunter",
    image: "/miners/miner4.svg",
    baseCost: 500,
    reward: 25,
    percent: "5%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 5,
    name: "Forge Master",
    image: "/miners/miner5.svg",
    baseCost: 1000,
    reward: 50,
    percent: "5%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 6,
    name: "Mining Drone",
    image: "/miners/miner6.svg",
    baseCost: 2000,
    reward: 160,
    percent: "8%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 7,
    name: "Quantum Excavator",
    image: "/miners/miner7.svg",
    baseCost: 5000,
    reward: 400,
    percent: "8%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 8,
    name: "Satellite Extractor",
    image: "/miners/miner8.svg",
    baseCost: 10000,
    reward: 800,
    percent: "8%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 9,
    name: "Planet Miner",
    image: "/miners/miner9.svg",
    baseCost: 15000,
    reward: 1200,
    percent: "8%",
    level: 0,
    maxLevel: 10,
  },
  {
    id: 10,
    name: "Gram Core Reactor",
    image: "/miners/miner10.svg",
    baseCost: 20000,
    reward: 1600,
    percent: "8%",
    level: 0,
    maxLevel: 10,
  },
];

// تكلفة الترقية بتزيد 10% كل مستوى: cost * (1.1 ^ level)
function getUpgradeCost(miner) {
  return Math.round(miner.baseCost * Math.pow(1.1, miner.level));
}

export default function Miners() {
  const { t } = useLanguage();
  const { coins, spendCoins } = useCoins(); // رصيد الحساب الحقيقي

  const [miners, setMiners] = useState(initialMiners);

  // الجهاز يكون مقفول لو مش أول جهاز واللي قبله لسه ما وصلش مستوى 1
  const isLocked = (index) => {
    if (index === 0) return false;
    return miners[index - 1].level < 1;
  };

  const handleUpgrade = (id) => {
    const index = miners.findIndex((m) => m.id === id);
    const miner = miners[index];

    if (isLocked(index)) return;
    if (miner.level >= miner.maxLevel) return;

    const cost = getUpgradeCost(miner);

    // بيخصم من رصيد الحساب فعليًا؛ لو الرصيد مش كفاية spendCoins بترجع false
    const paid = spendCoins(cost);
    if (!paid) return;

    setMiners((prev) =>
      prev.map((m) => (m.id === id ? { ...m, level: m.level + 1 } : m))
    );
  };

  return (
    <div className="min-h-full flex flex-col relative w-full px-4 pt-6">
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      />

      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white">Gram Miners</h1>
        <div className="bg-secondary/60 border border-white/10 rounded-xl px-4 py-2 text-yellow-400 font-bold">
          {coins.toLocaleString()} Coins
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto space-y-4 pb-8">
        {miners.map((miner, index) => {
          const locked = isLocked(index);
          const maxedOut = miner.level >= miner.maxLevel;
          const cost = getUpgradeCost(miner);
          const canAfford = coins >= cost;

          return (
            <div
              key={miner.id}
              className={`bg-secondary/60 backdrop-blur-sm border border-white/10 rounded-2xl p-4 ${
                locked ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl overflow-hidden bg-black border border-primary/20 flex items-center justify-center">
                    {locked ? (
                      <Lock className="w-6 h-6 text-muted-foreground" />
                    ) : (
                      <img
                        src={miner.image}
                        alt={miner.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div>
                    <h3 className="text-white font-bold text-lg">
                      {miner.name}
                    </h3>

                    {locked ? (
                      <p className="text-red-400 text-xs font-semibold">
                        Reach Level 1 on the previous miner to unlock
                      </p>
                    ) : (
                      <>
                        <p className="text-green-400 text-sm font-semibold">
                          {miner.reward} GRAM / 24h
                        </p>
                        <p className="text-primary text-xs">
                          Mining Bonus: {miner.percent}
                        </p>
                      </>
                    )}

                    <p className="text-gray-400 text-xs">
                      Level {miner.level} / {miner.maxLevel}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-yellow-400 font-bold text-lg">
                    {maxedOut ? "MAX" : `${cost.toLocaleString()} Coins`}
                  </div>

                  <button
                    onClick={() => handleUpgrade(miner.id)}
                    disabled={locked || maxedOut || !canAfford}
                    className={`mt-2 font-bold px-5 py-2 rounded-xl transition ${
                      locked || maxedOut || !canAfford
                        ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                        : "bg-primary text-black hover:opacity-90"
                    }`}
                  >
                    {maxedOut ? "Max Level" : "Upgrade"}
                  </button>
                </div>
              </div>

              <div className="mt-4 w-full bg-black/40 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full"
                  style={{
                    width: `${(miner.level / miner.maxLevel) * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="relative z-10 mt-4 rounded-2xl bg-secondary/60 border border-white/10 p-4">
        <div className="flex justify-between text-sm text-gray-300">
          <span>Exchange Rate</span>
          <span className="font-bold text-primary">700 GRAM = 1 TON</span>
        </div>

        <div className="mt-3 flex justify-between text-sm text-gray-300">
          <span>Upgrade Rule</span>
          <span className="text-green-400">+10% Cost / Level</span>
        </div>

        <div className="mt-3 flex justify-between text-sm text-gray-300">
          <span>Maximum Level</span>
          <span className="text-yellow-400">Level 10</span>
        </div>

        <div className="mt-3 flex justify-between text-sm text-gray-300">
          <span>Mining Cycle</span>
          <span className="text-blue-400">Every 24 Hours</span>
        </div>
      </div>
    </div>
  );
}

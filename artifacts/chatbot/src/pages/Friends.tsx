import CandlestickBg from '@/components/CandlestickBg';
import { Users, Copy, Share2, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { useState } from 'react';

export default function Friends() {
  const { referralCode, referralCount, referralBalance } = useWallet();
  const [copied, setCopied] = useState(false);

  const appUrl = 'https://gramminer-api-server-nine.vercel.app';
  const referralLink = `https://t.me/GramBot?start=${referralCode}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const text = `⛏️ انضم إلى GramMiner وابدأ تعدين GMR!\n\n💰 هتحصل على جهاز تعدين مجاني فور التسجيل\n\n👇 سجّل من رابطي:\n${referralLink}`;
    if (navigator.share) {
      navigator.share({ text });
    } else {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-full flex flex-col relative w-full overflow-hidden px-4 pt-6">
      <CandlestickBg />

      {/* Header */}
      <div className="relative z-10 mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-black text-white tracking-tight">FRIENDS</h1>
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
          <Users className="text-primary w-6 h-6" />
        </div>
      </div>

      {/* Referral Stats */}
      <div className="relative z-10 flex gap-3 mb-4">
        <div className="flex-1 bg-secondary/60 border border-white/5 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-white">{referralCount}</div>
          <div className="text-xs text-muted-foreground mt-1">إجمالي الإحالات</div>
        </div>
        <div className="flex-1 bg-secondary/60 border border-primary/20 rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-primary">{referralBalance.toFixed(4)}</div>
          <div className="text-xs text-muted-foreground mt-1">GMR مكافآت</div>
          <div className="text-[9px] text-primary/70 mt-0.5">للشراء فقط</div>
        </div>
      </div>

      {/* Invite Card */}
      <div className="relative z-10 bg-secondary/60 backdrop-blur-sm border border-white/5 rounded-3xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shadow-[0_0_15px_rgba(245,166,35,0.2)]">
            <Users className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">ادعُ صديق!</h2>
            <p className="text-xs text-muted-foreground">
              هتكسب <span className="text-primary font-black">0.01 GMR</span> لكل صديق يسجّل
            </p>
          </div>
        </div>

        {/* Referral Link Box */}
        <div className="bg-black/40 rounded-xl p-3 mb-4 border border-white/5">
          <div className="text-[10px] text-muted-foreground mb-1 font-semibold">رابط الإحالة الخاص بك</div>
          <div className="text-xs text-primary font-mono break-all">{referralLink}</div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleShare}
            className="flex-1 py-3 rounded-xl bg-primary text-black font-black flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,166,35,0.3)]"
          >
            <Share2 className="w-4 h-4" /> مشاركة
          </button>
          <button
            onClick={handleCopy}
            className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center gap-2 transition-colors font-bold text-sm"
          >
            {copied ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            {copied ? 'تم!' : 'نسخ'}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="relative z-10 bg-secondary/40 border border-white/5 rounded-2xl p-4 mb-4">
        <h3 className="text-sm font-black text-white mb-3">⚡ كيف يشتغل النظام</h3>
        <div className="space-y-2">
          {[
            { num: '1', text: 'شارك رابطك مع أصدقائك' },
            { num: '2', text: 'لما صديقك يسجّل عن طريق رابطك' },
            { num: '3', text: 'هتاخد 0.01 GMR على حسابك فوراً' },
            { num: '4', text: 'استخدم المكافآت لشراء أجهزة تعدين أقوى' },
          ].map(item => (
            <div key={item.num} className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black text-xs flex-shrink-0">
                {item.num}
              </div>
              <span className="text-sm text-muted-foreground">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Friends List */}
      <div className="relative z-10 flex-1 pb-8">
        <h3 className="text-xs font-black text-muted-foreground mb-3 tracking-widest">
          أصدقائك ({referralCount})
        </h3>
        {referralCount === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 bg-secondary/30 rounded-2xl border border-white/5 border-dashed">
            <Users className="w-8 h-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">مفيش أصدقاء لسه</p>
            <p className="text-xs text-muted-foreground/60 mt-1">شارك رابطك وابدأ تكسب!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: referralCount }, (_, i) => (
              <div key={i} className="bg-secondary/60 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <span className="text-sm text-white font-medium">صديق {i + 1}</span>
                </div>
                <span className="text-xs text-success font-bold">+0.01 GMR</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

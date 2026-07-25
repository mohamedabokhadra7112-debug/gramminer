# إعلانات البوت عبر AdsGram

## نظرة عامة
يمكن تشغيل إعلانات في **البوت على تيليجرام** (ليس فقط في Mini App) عبر AdsGram.

---

## خطوات الإعداد

### 1. إنشاء حساب ناشر
- اذهب إلى: https://adsgram.ai/publisher
- سجّل تطبيقك (Mini App أو Bot)
- احصل على **Block ID** لكل موضع إعلاني

### 2. Block IDs في المشروع

| الموضع | Block ID | الوصف |
|--------|----------|-------|
| Mini App – صفحة المهام | `VITE_ADSGRAM_BLOCK_ID` | إعلان فيديو داخل التطبيق |
| البوت – رسائل دورية | انظر قسم البوت أدناه | إعلانات نصية/صور في رسائل البوت |

---

## إعلانات داخل المهام (Mini App) ← مُنفَّذ ✅

```
الملف:  artifacts/chatbot/src/lib/adsgram.ts
المتغير: VITE_ADSGRAM_BLOCK_ID=<block_id_from_adsgram>
```

---

## إعلانات داخل البوت (Telegram Bot Messages) ← للتفعيل

### الطريقة: AdsGram Bot Publisher API

**1. أضف البوت @AdsGram_Publisher_bot**
```
/start
/addbot @your_bot_username
```

**2. إعداد الإرسال التلقائي في الكود**
```typescript
// في artifacts/api-server/src/lib/botAds.ts
// مثال: أرسل إعلان لكل مستخدم مرة يومياً

async function sendBotAd(telegramId: number, adText: string, adImageUrl?: string) {
  const token = process.env['BOT_TOKEN'];
  if (!token) return;
  
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegramId,
      photo: adImageUrl ?? 'https://your-ad-image.com/ad.jpg',
      caption: adText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔗 زيارة الرابط', url: 'https://advertiser-link.com' }
        ]]
      }
    })
  });
}
```

**3. جدولة الإرسال**
```typescript
// في src/index.ts
// أرسل إعلانات كل يوم لكل مستخدم نشط في آخر 7 أيام
setInterval(async () => {
  const { pool } = await import('@workspace/db');
  const users = await pool.query(
    `SELECT telegram_id FROM gm_users 
     WHERE last_active_at > NOW() - INTERVAL '7 days'
     ORDER BY RANDOM() LIMIT 100`
  );
  for (const u of users.rows) {
    await sendBotAd(u.telegram_id, '<b>تعدين أكثر!</b>\nاشحن رصيدك الآن واكسب أكثر.');
    await new Promise(r => setTimeout(r, 500)); // تأخير لتجنب Rate Limit
  }
}, 24 * 60 * 60 * 1000);
```

---

## الإعدادات عبر لوحة الأدمن

| المفتاح | القيمة الافتراضية | الوصف |
|---------|------------------|-------|
| `ad_reward_coins` | 10 | عدد الكوين لكل إعلان مشاهَد |
| `ad_daily_limit` | 10 | الحد الأقصى للإعلانات يومياً لكل مستخدم |

---

## المتغيرات البيئية المطلوبة

```env
VITE_ADSGRAM_BLOCK_ID=12345          # Block ID من AdsGram dashboard
BOT_TOKEN=123456:ABC...              # توكن البوت للإشعارات
```

أضف هذه المتغيرات عبر: Replit → Secrets

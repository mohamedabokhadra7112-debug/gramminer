---
name: Telegram Mini App gotchas
description: Real-account/profile-photo handling and mobile viewport/scroll issues specific to Telegram Mini Apps (WebView).
---

**Never trust `initDataUnsafe.user` client-side for anything sensitive or "who is this really."** Telegram's WebApp script exposes `initData` (a signed query string) alongside the convenience-but-unverified `initDataUnsafe`. Validate `initData` server-side with HMAC-SHA256 (secret = HMAC-SHA256("WebAppData", bot_token), compare against the `hash` field) before trusting the user identity. Without this, "test mode" placeholder/default users can leak through indistinguishably from real ones.

**Profile photos require a server round-trip.** `initDataUnsafe.user.photo_url` is not reliably populated. The reliable path: server calls Telegram Bot API `getUserProfilePhotos` → `getFile` → fetch the file bytes with the bot token, then proxy/stream them back (the file URL itself requires the bot token, so it can't be used directly as an `<img src>`).

**`100dvh` is not reliable inside Telegram's in-app WebView.** Telegram's own chrome (header, expand/collapse, keyboard) can make `100dvh` report more height than is actually visible, making pages look frozen/unscrollable on real phones while working fine in a normal desktop browser preview. Fix: call `tg.ready()` + `tg.expand()` on mount, track `tg.viewportStableHeight`/`viewportChanged` event into a CSS var, and use that var (with `100dvh` fallback) instead of a bare Tailwind `h-[100dvh]`.

**Why:** These are easy to miss because they only manifest inside the real Telegram client, not in the plain browser dev preview — typecheck and a desktop screenshot both look fine while the on-device experience is broken.

**How to apply:** Any Telegram Mini App work touching user identity, avatars, or full-height layouts should route through a verified-initData backend endpoint (not raw `initDataUnsafe`) and the viewport-height-var pattern above.

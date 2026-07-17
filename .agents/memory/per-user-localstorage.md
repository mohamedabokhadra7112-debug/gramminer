---
name: Per-user localStorage keys
description: How GramMiner isolates data per Telegram account in localStorage
---

All gmr_ localStorage keys must be suffixed with the Telegram user ID (e.g. `gmr_holding_balance_123456789`) so two different Telegram accounts on the same device never share state.

**Why:** The original code used a single key `gmr_holding_balance` shared across all users, causing accounts to bleed into each other.

**How to apply:** Use `window.Telegram?.WebApp?.initDataUnsafe?.user?.id` which is available synchronously (no async needed). Fall back to the generic key only if the ID is absent (e.g. desktop preview). Pattern in `WalletContext.tsx`:
```ts
function getLsKey(suffix: string): string {
  const tgId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  return tgId ? `gmr_${suffix}_${tgId}` : `gmr_${suffix}`;
}
```

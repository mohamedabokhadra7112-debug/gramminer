// Shared helpers for talking to the API server from the Mini App.
//
// In Replit dev, requests to relative "/api/..." paths are proxied to the
// API server (see vite.config.ts), so API_BASE stays empty there.
// For a split deployment, VITE_API_URL can point at the API server's
// absolute origin. Replit development uses the Vite proxy below instead.
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function getInitData(): string {
  return window.Telegram?.WebApp?.initData ?? '';
}

/** POSTs to an /api/telegram/* endpoint, always including the raw initData
 *  so the Backend can verify the caller's Telegram identity server-side. */
export async function telegramApiPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: getInitData(), ...body }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

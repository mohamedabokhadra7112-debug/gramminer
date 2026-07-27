/**
 * AdsGram integration hook for Telegram Mini Apps.
 *
 * ── Setup ──────────────────────────────────────────────────────────────────
 * 1. Go to https://adsgram.ai/publisher and register your Mini App.
 * 2. Create an ad placement (Block) and copy the Block ID.
 * 3. In Replit → Secrets, add:
 *      VITE_ADSGRAM_BLOCK_ID = <your block id>
 * 4. The hook loads the SDK lazily on first call and caches the controller.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *   const { showAd, ready } = useAdsGram();
 *   const result = await showAd(); // resolves { done: true } or throws
 */

import { useCallback, useEffect, useRef } from 'react';

// ── SDK types ─────────────────────────────────────────────────────────────────
interface AdController {
  show: () => Promise<{ done: boolean; error?: boolean; description?: string }>;
  destroy: () => void;
}

declare global {
  interface Window {
    Adsgram?: {
      init: (options: { blockId: string; debug?: boolean }) => AdController;
    };
  }
}

const SDK_URL = 'https://sad.adsgram.ai/js/sad.min.js';
const SCRIPT_ID = 'adsgram-sdk';

// ── Block ID from env ─────────────────────────────────────────────────────────
export const ADSGRAM_BLOCK_ID: string =
  (import.meta.env.VITE_ADSGRAM_BLOCK_ID as string | undefined) ?? '';

// ── Load SDK script once ──────────────────────────────────────────────────────
function loadSdkScript(): Promise<void> {
  if (document.getElementById(SCRIPT_ID)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load AdsGram SDK'));
    document.head.appendChild(s);
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export interface UseAdsGramResult {
  /** Call to show an ad. Resolves { done: true } if watched to completion; throws on skip/error. */
  showAd: () => Promise<{ done: boolean }>;
  /** True if a blockId is configured (env var is set). */
  configured: boolean;
}

export function useAdsGram(): UseAdsGramResult {
  const controllerRef = useRef<AdController | null>(null);
  const configured = Boolean(ADSGRAM_BLOCK_ID);

  // Per Adsgram docs: load the SDK and init the controller ONCE, then reuse
  // the same controller for every show() call.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    loadSdkScript()
      .then(() => {
        if (cancelled || controllerRef.current || !window.Adsgram) return;
        try {
          controllerRef.current = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
        } catch { /* init may fail outside Telegram env — showAd will retry */ }
      })
      .catch(() => {}); // best-effort pre-load
    return () => {
      cancelled = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [configured]);

  const showAd = useCallback(async (): Promise<{ done: boolean }> => {
    if (!configured) {
      throw new Error('VITE_ADSGRAM_BLOCK_ID is not set');
    }

    // Ensure SDK + controller exist (retry path if pre-init failed)
    if (!controllerRef.current) {
      await loadSdkScript();
      await new Promise(r => setTimeout(r, 100));
      if (!window.Adsgram) throw new Error('AdsGram SDK failed to initialize');
      controllerRef.current = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
    }

    // Per docs: show() resolves when the user watches till the end,
    // rejects on skip/error with a ShowPromiseResult.
    try {
      const result = await controllerRef.current.show();
      if (!result.done) {
        throw new Error(result.description ?? 'Ad was skipped or closed early');
      }
      return { done: true };
    } catch (e: unknown) {
      // Adsgram rejects with a ShowPromiseResult object, not an Error
      if (e && typeof e === 'object' && 'description' in e) {
        throw new Error(String((e as { description?: string }).description ?? 'Ad error'));
      }
      throw e;
    }
  }, [configured]);

  return { showAd, configured };
}

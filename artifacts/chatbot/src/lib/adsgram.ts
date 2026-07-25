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

  // Pre-load SDK on mount for faster first show
  useEffect(() => {
    if (!configured) return;
    loadSdkScript().catch(() => {}); // best-effort pre-load
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [configured]);

  const showAd = useCallback(async (): Promise<{ done: boolean }> => {
    if (!configured) {
      throw new Error('VITE_ADSGRAM_BLOCK_ID is not set');
    }

    await loadSdkScript();

    // Small delay to ensure SDK is initialized after script load
    await new Promise(r => setTimeout(r, 100));

    if (!window.Adsgram) {
      throw new Error('AdsGram SDK failed to initialize');
    }

    const controller = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID });
    controllerRef.current = controller;

    const result = await controller.show();

    if (!result.done) {
      throw new Error(result.description ?? 'Ad was skipped or closed early');
    }

    return { done: true };
  }, [configured]);

  return { showAd, configured };
}

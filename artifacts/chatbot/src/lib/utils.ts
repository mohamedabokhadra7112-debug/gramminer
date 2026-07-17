import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a gram balance for display.
 *
 * Why not `toLocaleString(undefined, …)`?
 * Passing `undefined` as the locale delegates to the device locale, which
 * can produce Arabic-Indic digits on Arab devices and — worse — some
 * Telegram Android WebViews silently ignore the options object and call
 * `.toString()` instead, yielding the raw floating-point string
 * (e.g. "300000.0260000000000001…").
 *
 * Fix: always round to `decimals` places first (eliminates IEEE-754 drift),
 * then use the explicit `'en-US'` locale (ASCII digits + comma separator on
 * every platform), with a try/catch in case Intl is absent.
 */
export function formatGram(val: number, decimals = 4): string {
  // Last-resort guard: NaN / Infinity must never reach the display layer.
  // All callers should already pass a finite number, but this catches any
  // future slip (e.g. a null API response coerced with Number()).
  const safe = Number.isFinite(val) ? val : 0;
  const factor  = Math.pow(10, decimals);
  const rounded = Math.round(safe * factor) / factor;
  try {
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return rounded.toFixed(decimals);
  }
}

/**
 * GET /api/tonconnect-manifest
 *
 * Returns the TON Connect manifest JSON dynamically so that `iconUrl`
 * always resolves to the correct origin (no hard-coded Vercel URL,
 * no 302 redirects that TON wallets won't follow).
 *
 * The frontend passes its own origin as `?origin=<url>` so the icon
 * URL stays consistent even when the request passes through a proxy.
 */
import { Router } from "express";

const router = Router();

router.get("/tonconnect-manifest", (req, res) => {
  // Prefer the explicit origin query param sent by the frontend.
  // Fall back to reconstructing from the Host header.
  const origin =
    (req.query.origin as string | undefined)?.trim() ||
    `${req.protocol}://${req.get("host")}`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    url: origin,
    name: "GramMiner",
    iconUrl: `${origin}/favicon.png`,
  });
});

export default router;

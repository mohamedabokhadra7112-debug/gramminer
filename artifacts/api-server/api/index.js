/**
 * Vercel serverless entry point.
 *
 * Imports the pre-built Express app bundle produced by esbuild (dist/app.mjs).
 * Because esbuild resolves all workspace packages at build time, Vercel's
 * @vercel/node builder only needs to process this one-line file — it has no
 * workspace imports to resolve itself.
 *
 * Vercel detects the default-exported Express app and routes all HTTP requests
 * through it automatically.
 */
export { default } from "../dist/app.mjs";

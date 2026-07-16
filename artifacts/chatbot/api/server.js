/**
 * Vercel Serverless entry-point for the API server.
 * esbuild bundles all workspace packages at build time, so this file just
 * re-exports the pre-built Express app — no workspace imports needed here.
 */
export { default } from "../../api-server/dist/app.mjs";

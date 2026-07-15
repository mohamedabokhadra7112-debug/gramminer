// Vercel serverless entry point — re-exports the Express app.
// Vercel's @vercel/node builder detects the default export as the request handler.
export { default } from "../src/app";

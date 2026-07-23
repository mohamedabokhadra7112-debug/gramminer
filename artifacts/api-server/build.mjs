import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Packages that must NOT be bundled (native modules, dynamic loaders, etc.).
 * These are externalised so Node can load them at runtime from node_modules.
 */
const external = [
  "*.node", "sharp", "better-sqlite3", "sqlite3", "canvas", "bcrypt",
  "argon2", "fsevents", "re2", "farmhash", "xxhash-addon", "bufferutil",
  "utf-8-validate", "ssh2", "cpu-features", "dtrace-provider",
  "isolated-vm", "lightningcss", "pg-native", "oracledb",
  "mongodb-client-encryption", "nodemailer", "handlebars", "knex",
  "typeorm", "protobufjs", "onnxruntime-node", "@tensorflow/*",
  "@prisma/client", "@mikro-orm/*", "@grpc/*", "@swc/*", "@aws-sdk/*",
  "@azure/*", "@opentelemetry/*", "@google-cloud/*", "@google/*",
  "googleapis", "firebase-admin", "@parcel/watcher",
  "@sentry/profiling-node", "@tree-sitter/*", "aws-sdk",
  "classic-level", "dd-trace", "ffi-napi", "grpc", "hiredis",
  "kerberos", "leveldown", "miniflare", "mysql2", "newrelic", "odbc",
  "piscina", "realm", "ref-napi", "rocksdb", "sass-embedded",
  "sequelize", "serialport", "snappy", "tinypool", "usb", "workerd",
  "wrangler", "zeromq", "zeromq-prebuilt", "playwright", "puppeteer",
  "puppeteer-core", "electron",
];

/**
 * CJS-compat banner — makes bundled CJS packages work inside an ESM output file.
 */
const banner = {
  js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';
globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
`,
};

const shared = {
  platform: "node",
  bundle: true,
  format: "esm",
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  sourcemap: "linked",
  external,
  banner,
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
};

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // ── Entry 1: full server (calls app.listen) ─────────────────────────────
  // Used by `pnpm run start` (local / Replit dev).
  await esbuild({
    ...shared,
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    outdir: distDir,
  });

}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});

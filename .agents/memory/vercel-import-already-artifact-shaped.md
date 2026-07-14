---
name: Vercel import already artifact-shaped
description: Some Vercel-imported projects are not raw Next.js apps — they were already built on Replit's pnpm-workspace/artifact conventions and merely deployed to Vercel. Check before doing a Next.js-to-Vite conversion.
---

The standard Vercel port guide assumes the imported project is Next.js and needs full conversion to Vite + React. Not always true: some imports are Replit-built pnpm-workspace apps (with `artifacts/<slug>/.replit-artifact/artifact.toml`, `vite.config.ts`, catalog: deps, workspace:* deps already in place) that were pushed to Vercel via a `vercel.json` buildCommand pointing at one artifact, then re-imported.

**Why:** Running the full Next.js conversion process on an already-Vite app wastes time and risks breaking a structure that already matches Replit conventions.

**How to apply:** Before running `fullstack-detect.sh` or the Next.js conversion steps, inspect `.migration-backup/` for `artifacts/*/.replit-artifact/artifact.toml` and a `vite.config.ts` per artifact. If found, treat it as an already-correct artifact tree: create the matching artifact via `createArtifact`, copy `src/`, `public/`, `index.html`, `components.json` over (keep the scaffold's own `package.json`/`vite.config.ts`/`tsconfig.json`), then diff dependencies instead of rewriting routing/data-fetching from scratch.

Also: the artifact scanner may pick up `.replit-artifact/artifact.toml` files still present inside `.migration-backup/`, registering duplicate workflows with the same ports as the live artifacts. Delete the `.replit-artifact` folders under `.migration-backup` (keep the rest of the backup) to stop this.

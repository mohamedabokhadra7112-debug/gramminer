---
name: Mockup sandbox build defaults
description: Environment defaults needed for the mockup preview artifact to participate in a root workspace build.
---

The mockup sandbox Vite config must be buildable without workflow-only environment variables. PORT and BASE_PATH should have harmless defaults, while workflow metadata can still override them for live previews.

**Why:** The root `pnpm run build` runs every artifact, so requiring PORT or BASE_PATH at config import time makes an otherwise healthy workspace build fail outside the preview workflow.

**How to apply:** Keep runtime-specific values in the artifact workflow metadata, but make Vite configuration imports safe for production builds and CI-style checks.
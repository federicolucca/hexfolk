// Bundles the MCP server (and the src/core it reuses) into dist/server.js. The SDK and zod stay
// external, resolved from packages/mcp/node_modules at run time. Run from the repo root:
//   vite build -c packages/mcp/vite.config.ts   (npm run mcp:build)
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  build: {
    ssr: here('src/server.ts'),
    outDir: here('dist'),
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rollupOptions: { output: { banner: '#!/usr/bin/env node' } },
  },
});

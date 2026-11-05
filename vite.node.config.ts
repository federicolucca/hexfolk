// Bundles the Node tools (the simulator) that reuse src/core, which uses extensionless imports.
// Output goes to dist-node/. The browser build (vite.config.ts) never sees these files.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'scripts/sim.ts',
    outDir: 'dist-node',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
  },
});

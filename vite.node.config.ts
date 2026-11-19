// Bundles the Node tools (the simulator and the benchmark) that reuse src/core, which uses
// extensionless imports. Output goes to dist-node/. The browser build (vite.config.ts) never sees these files.
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    rollupOptions: { input: { sim: 'scripts/sim.ts', bench: 'bench/cli.ts' }, output: { entryFileNames: '[name].js' } },
    outDir: 'dist-node',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
  },
});

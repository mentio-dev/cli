import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  sourcemap: true,
  clean: true,
  target: 'node22',
  // The SDK is a workspace package; bundle it so `npx @mentio-dev/cli` needs nothing else.
  noExternal: ['@mentio-dev/sdk'],
  banner: { js: '#!/usr/bin/env node' },
});

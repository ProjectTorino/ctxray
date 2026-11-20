import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  logLevel: 'info',
};

// CLI entry (single-file executable).
await build({
  ...shared,
  entryPoints: [resolve(root, 'src/cli.ts')],
  outfile: resolve(root, 'dist/ctxray.mjs'),
  banner: { js: '#!/usr/bin/env node' },
});

// Library entry (used by tests and library consumers).
await build({
  ...shared,
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'dist/index.mjs'),
});

console.log('built dist/ctxray.mjs and dist/index.mjs');

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'mailboxes/whatsapp-preload': 'electron/mailboxes/whatsapp-preload.ts',
    'main/index': 'electron/main/index.ts',
    'preload/index': 'electron/preload/index.ts',
  },
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist-electron',
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  external: ['electron'],
});

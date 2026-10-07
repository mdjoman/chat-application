import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'chat-widget': 'src/index.ts' },
  format: ['iife'],
  // No `globalName` — we assign window.ChatWidget ourselves in index.ts.
  // Using globalName with no exports produces `var ChatWidget = {}` which
  // would clobber our side-effect assignment.
  minify: true,
  sourcemap: true,
  clean: true,
  dts: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  loader: {
    '.tsx': 'tsx',
  },
  esbuildOptions(options) {
    options.jsx = 'automatic';
    options.jsxImportSource = 'preact';
  },
  // Force the output name we want (esbuild appends `.global` for IIFE
  // unless we disable that — tsup exposes this via outExtension)
  outExtension() {
    return { js: '.js' };
  },
});

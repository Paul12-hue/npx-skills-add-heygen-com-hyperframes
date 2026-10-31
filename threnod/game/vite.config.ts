import { defineConfig } from 'vite';

export default defineConfig({
  // relative paths so the build works from any folder or private link
  base: './',
  build: {
    target: 'es2020', // iPad Safari 16+ friendly
    chunkSizeWarningLimit: 900,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In CI, GITHUB_REPOSITORY ("owner/repo") is set; locally we fall back to this repository.
const REPO = process.env.GITHUB_REPOSITORY || 'payemo/devdigest-ai-marketplace';

export default defineConfig({
  // Relative asset URLs: the same build works under /<repo>/ on GitHub Pages and at / locally.
  base: './',
  plugins: [react()],
  define: { __REPO__: JSON.stringify(REPO) },
  build: {
    rollupOptions: {
      // Two real HTML pages (Search, What's new) sharing one bundle.
      input: { index: 'index.html', changelog: 'changelog.html' },
    },
  },
  server: { port: 5173, open: false },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});

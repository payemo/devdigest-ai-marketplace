import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In CI, GITHUB_REPOSITORY ("owner/repo") is set; locally we fall back to this repository.
const REPO = process.env.GITHUB_REPOSITORY || 'payemo/devdigest-ai-marketplace';

const messages = JSON.parse(readFileSync(new URL('./src/locales/en.json', import.meta.url), 'utf8'));
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Static HTML (title, meta, <noscript>) cannot run JS, so its text is filled in at build time from the same
// locale file the components use: write %t:some.key% in an HTML entry. <a>…</a> in a message links to the repo.
function htmlMessages() {
  return {
    name: 'html-messages',
    transformIndexHtml: (html) => html.replace(/%t:([\w.]+)%/g, (_, key) => {
      const text = key.split('.').reduce((o, k) => o?.[k], messages);
      if (typeof text !== 'string') throw new Error(`html-messages: no message "${key}"`);
      return escapeHtml(text).replace(/&lt;a&gt;(.*?)&lt;\/a&gt;/g, `<a href="https://github.com/${REPO}">$1</a>`);
    }),
  };
}

export default defineConfig({
  // Relative asset URLs: the same build works under /<repo>/ on GitHub Pages and at / locally.
  base: './',
  plugins: [react(), htmlMessages()],
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
